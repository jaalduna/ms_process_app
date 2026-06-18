/// Resolve the directory where config.json should live.
/// For AppImage on Linux, `current_exe()` points inside the mounted filesystem,
/// so we use the `$APPIMAGE` env var to find the real location on disk.
/// Otherwise, we use the directory containing the executable.
fn exe_adjacent_dir() -> Option<std::path::PathBuf> {
    #[cfg(target_os = "linux")]
    {
        if let Ok(appimage) = std::env::var("APPIMAGE") {
            return std::path::Path::new(&appimage).parent().map(|p| p.to_path_buf());
        }
    }

    std::env::current_exe()
        .ok()?
        .parent()
        .map(|p| p.to_path_buf())
}

/// Read external config.json with layered resolution:
/// 1. Per-user: ~/.config/com.kantar.sqldatabricksbridge/config.json (highest priority)
/// 2. Per-installation: config.json next to the executable/AppImage
/// 3. Fallback: empty object (built-in defaults apply in the frontend)
///
/// When both files exist, per-user values override per-installation values.
fn resolve_config() -> serde_json::Value {
    let mut merged: serde_json::Value = serde_json::Value::Object(serde_json::Map::new());

    // Layer 1: per-installation config (next to exe/AppImage)
    if let Some(exe_dir) = exe_adjacent_dir() {
        let path = exe_dir.join("config.json");
        if path.exists() {
            if let Ok(contents) = std::fs::read_to_string(&path) {
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(&contents) {
                    merge_json(&mut merged, &val);
                }
            }
        }
    }

    // Layer 2: per-user config (XDG / AppData)
    if let Some(config_dir) = dirs::config_dir() {
        let path = config_dir
            .join("com.kantar.sqldatabricksbridge")
            .join("config.json");
        if path.exists() {
            if let Ok(contents) = std::fs::read_to_string(&path) {
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(&contents) {
                    merge_json(&mut merged, &val);
                }
            }
        }
    }

    merged
}

#[tauri::command]
fn read_config() -> Result<String, String> {
    serde_json::to_string(&resolve_config()).map_err(|e| e.to_string())
}

/// MOCK mode = no external config.json provided a non-empty `API_URL`. In that
/// case the app runs offline against the bundled mock sidecar; otherwise it
/// targets the real backend and the sidecar is never started.
#[cfg(feature = "mock-sidecar")]
fn is_mock_mode() -> bool {
    match resolve_config().get("API_URL") {
        Some(serde_json::Value::String(s)) => s.trim().is_empty(),
        _ => true,
    }
}

/// Deep-merge `source` into `target`. Source values win on conflict.
fn merge_json(target: &mut serde_json::Value, source: &serde_json::Value) {
    match (target, source) {
        (serde_json::Value::Object(t), serde_json::Value::Object(s)) => {
            for (key, val) in s {
                merge_json(t.entry(key.clone()).or_insert(serde_json::Value::Null), val);
            }
        }
        (target, source) => {
            *target = source.clone();
        }
    }
}

/// Holds the spawned mock-backend sidecar child so it can be killed on app exit.
#[cfg(feature = "mock-sidecar")]
struct MockSidecar(std::sync::Mutex<Option<tauri_plugin_shell::process::CommandChild>>);

/// Spawn the bundled mock backend sidecar (binaries/mock-server-<triple>).
/// The mock listens on :5000, which is the API_URL baked into config.js.
#[cfg(feature = "mock-sidecar")]
fn spawn_mock_sidecar(app: &tauri::AppHandle) {
    use tauri::Manager;
    use tauri_plugin_shell::ShellExt;

    match app.shell().sidecar("mock-server") {
        Ok(cmd) => match cmd.env("PORT", "5000").spawn() {
            Ok((mut rx, child)) => {
                app.manage(MockSidecar(std::sync::Mutex::new(Some(child))));
                // Drain the sidecar's stdout/stderr so its pipe never fills and blocks it.
                tauri::async_runtime::spawn(async move {
                    use tauri_plugin_shell::process::CommandEvent;
                    while let Some(event) = rx.recv().await {
                        if let CommandEvent::Stderr(line) | CommandEvent::Stdout(line) = event {
                            eprintln!("[mock] {}", String::from_utf8_lossy(&line));
                        }
                    }
                });
            }
            Err(e) => eprintln!("Failed to spawn mock sidecar: {e}"),
        },
        Err(e) => eprintln!("Failed to resolve mock sidecar: {e}"),
    }
}

/// Kill the mock sidecar if it is still running.
#[cfg(feature = "mock-sidecar")]
fn kill_mock_sidecar(app: &tauri::AppHandle) {
    use tauri::Manager;
    if let Some(state) = app.try_state::<MockSidecar>() {
        if let Some(child) = state.0.lock().unwrap().take() {
            let _ = child.kill();
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Fix WebKitGTK EGL crash on Wayland compositors (Hyprland, Sway, etc.)
    #[cfg(target_os = "linux")]
    {
        std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init());

    #[cfg(feature = "mock-sidecar")]
    let builder = builder.plugin(tauri_plugin_shell::init());

    let app = builder
        .invoke_handler(tauri::generate_handler![read_config])
        // Kill the mock sidecar as soon as a window is destroyed (app close), not only
        // on the final RunEvent::Exit — so closing the app reliably stops mock-server.exe
        // and never leaves it holding a lock during a later update/reinstall.
        .on_window_event(|_window, _event| {
            #[cfg(feature = "mock-sidecar")]
            if let tauri::WindowEvent::Destroyed = _event {
                use tauri::Manager;
                kill_mock_sidecar(_window.app_handle());
            }
        })
        .setup(|app| {
            #[cfg(desktop)]
            app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;
            #[cfg(feature = "mock-sidecar")]
            if is_mock_mode() {
                spawn_mock_sidecar(app.handle());
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while running tauri application");

    app.run(|_app_handle, _event| {
        #[cfg(feature = "mock-sidecar")]
        if let tauri::RunEvent::Exit = _event {
            kill_mock_sidecar(_app_handle);
        }
    });
}

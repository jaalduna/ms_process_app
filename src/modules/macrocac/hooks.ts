// JAA-1051 — react-query hooks for the macrocac upload/run MVP.

import { useMutation } from "@tanstack/react-query"
import { createMacrocacRun, uploadMacrocacFile } from "./api"

export function useUploadMacrocac() {
  return useMutation({ mutationFn: uploadMacrocacFile })
}

export function useCreateMacrocacRun() {
  return useMutation({ mutationFn: createMacrocacRun })
}

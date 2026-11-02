import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import {
  ShelfSessionInfo,
  ShelfTransferProgressPayload,
  ShelfFileReceivedPayload,
  ShelfTransferCompletedPayload,
} from "../types/shelfTransfer";

export async function startShelfSend(paths: string[]): Promise<ShelfSessionInfo> {
  return await invoke<ShelfSessionInfo>("start_shelf_send", { paths });
}

export async function startShelfReceive(): Promise<ShelfSessionInfo> {
  return await invoke<ShelfSessionInfo>("start_shelf_receive");
}

export async function stopShelfTransfer(): Promise<void> {
  await invoke("stop_shelf_transfer");
}

export async function getShelfTransferStatus(): Promise<ShelfSessionInfo | null> {
  return await invoke<ShelfSessionInfo | null>("get_shelf_transfer_status");
}

export function onShelfTransferProgress(
  callback: (payload: ShelfTransferProgressPayload) => void
): Promise<UnlistenFn> {
  return listen<ShelfTransferProgressPayload>("shelf-transfer-progress", (event) => {
    callback(event.payload);
  });
}

export function onShelfFileReceived(
  callback: (payload: ShelfFileReceivedPayload) => void
): Promise<UnlistenFn> {
  return listen<ShelfFileReceivedPayload>("shelf-file-received", (event) => {
    callback(event.payload);
  });
}

export function onShelfTransferCompleted(
  callback: (payload: ShelfTransferCompletedPayload) => void
): Promise<UnlistenFn> {
  return listen<ShelfTransferCompletedPayload>("shelf-transfer-completed", (event) => {
    callback(event.payload);
  });
}


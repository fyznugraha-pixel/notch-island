export interface ShelfFileMeta {
  name: string;
  size: number;
  size_formatted: string;
  path: string;
}

export interface ShelfSessionInfo {
  token: string;
  url: string;
  port: number;
  local_ip: string;
  expires_in_sec: number;
  mode: "send" | "receive";
  files?: ShelfFileMeta[];
  computer_name: string;
}

export interface ShelfTransferProgressPayload {
  id: string;
  name: string;
  size: number;
  transferred: number;
  progress: number;
  status: "transferring" | "completed" | "error";
  device_name: string;
  speed_formatted?: string;
}

export interface ShelfFileReceivedPayload {
  id: string;
  name: string;
  path: string;
  ext: string;
  size: number;
  size_formatted: string;
  device_name: string;
  added_at: number;
  thumbnail?: string;
}

export interface ShelfTransferCompletedPayload {
  device_name: string;
  total_files: number;
  total_bytes: number;
}

export type ShelfTransferMode = "idle" | "send" | "receive" | "receiving";


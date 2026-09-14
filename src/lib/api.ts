import { NextResponse } from "next/server";
import { logError, logWarn } from "./logger";

export function failure(
  message: string,
  status = 400,
  context?: Record<string, unknown>,
) {
  if (status >= 500) {
    logError(`API Server Error [${status}]: ${message}`, undefined, context);
  } else if (status >= 400) {
    logWarn(`API Client Failure [${status}]: ${message}`, context);
  }
  return NextResponse.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export function ok(data: unknown) {
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}

export function databaseFailure(
  error: { code: string; message: string },
  context?: Record<string, unknown>,
) {
  const messages: Record<string, string> = {
    VS001: "Bạn cần đăng nhập để thực hiện thao tác này.",
    VS002: "Tài khoản chưa có quyền thực hiện thao tác này.",
    VS003: "Hoạt động đã kết thúc hoặc không còn hiển thị.",
    VS004: "Bạn không thể tự xác nhận hoạt động của mình.",
    VS005: "Thông tin hoạt động không hợp lệ. Kiểm tra địa điểm và thời gian.",
    VS006: "Bạn thao tác quá nhanh. Hãy thử lại sau.",
  };

  const status =
    error.code === "VS001"
      ? 401
      : error.code === "VS002"
        ? 403
        : error.code === "VS003"
          ? 404
          : error.code === "VS006"
            ? 429
            : 400;

  return failure(
    messages[error.code] || "Chưa thể lưu thay đổi. Vui lòng thử lại.",
    status,
    { dbErrorCode: error.code, dbErrorMessage: error.message, ...context },
  );
}

export async function readBody(request: Request) {
  // Bound JSON bodies before parsing; activity descriptions are capped at 600 characters.
  const maxBodyBytes = 8192;
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Thiếu dữ liệu.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBodyBytes) {
      await reader.cancel();
      throw new Error("Dữ liệu quá lớn.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    throw new Error("Dữ liệu không hợp lệ.");
  }
}

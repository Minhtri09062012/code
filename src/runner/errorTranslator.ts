/**
 * Trình biên dịch lỗi Python sang giải thích tiếng Việt thân thiện với học sinh
 * Không in traceback dài phức tạp mà chỉ trích xuất loại lỗi, dòng lỗi và hướng dẫn khắc phục.
 */

export interface FriendlyError {
  errorType: string;
  line?: number;
  message: string;
  original: string;
}

export function translatePythonError(rawError: string): FriendlyError {
  const original = rawError.trim();

  // Tìm dòng bị lỗi: File "...", line X hoặc File "<string>", line X
  const lineMatch = original.match(/line (\d+)/i);
  const line = lineMatch ? parseInt(lineMatch[1], 10) : undefined;

  // Lấy dòng lỗi cuối cùng (thường là Type: Message)
  const lines = original.split('\n').filter((l) => l.trim().length > 0);
  const lastLine = lines[lines.length - 1] || original;

  let errorType = 'RuntimeError';
  let detail = lastLine;

  const colonIdx = lastLine.indexOf(':');
  if (colonIdx !== -1) {
    errorType = lastLine.substring(0, colonIdx).trim();
    detail = lastLine.substring(colonIdx + 1).trim();
  }

  let message = '';
  switch (errorType) {
    case 'SyntaxError':
      message = `Lỗi cú pháp (SyntaxError): Cấu trúc câu lệnh chưa đúng ngữ pháp Python (em hãy kiểm tra dấu hai chấm ':', cặp ngoặc '()' hoặc dấu nháy chuỗi).`;
      break;
    case 'IndentationError':
      message = `Lỗi thụt lề (IndentationError): Các câu lệnh trong cùng khối (trong if, for, while, def) phải thụt lề đều nhau (thường là 4 dấu cách).`;
      break;
    case 'IndexError':
      message = `Lỗi chỉ số (IndexError): Đang truy cập phần tử ngoài phạm vi độ dài mảng/chuỗi (ví dụ: mảng có n phần tử thì chỉ số chỉ từ 0 đến n-1).`;
      break;
    case 'KeyError':
      message = `Lỗi khóa từ điển (KeyError): Khóa ${detail || ''} không tồn tại trong dictionary.`;
      break;
    case 'ZeroDivisionError':
      message = `Lỗi chia cho 0 (ZeroDivisionError): Phép toán chia (/ hoặc // hoặc %) có mẫu số bằng 0.`;
      break;
    case 'ValueError':
      message = `Lỗi giá trị (ValueError): Giá trị đưa vào hàm không hợp lệ (ví dụ ép kiểu int('abc')). Chi tiết: ${detail}`;
      break;
    case 'TypeError':
      message = `Lỗi kiểu dữ liệu (TypeError): Phép toán hoặc hàm thực hiện trên kiểu dữ liệu không phù hợp (ví dụ cộng chuỗi với số mà chưa đổi kiểu). Chi tiết: ${detail}`;
      break;
    case 'NameError':
      message = `Lỗi biến chưa khai báo (NameError): Tên biến hoặc hàm chưa được định nghĩa trước khi dùng. Chi tiết: ${detail}`;
      break;
    case 'RecursionError':
      message = `Lỗi tràn đệ quy (RecursionError): Hàm đệ quy gọi lại chính nó quá nhiều lần mà chưa chạm tới điều kiện dừng.`;
      break;
    case 'MemoryError':
      message = `Lỗi tràn bộ nhớ (MemoryError): Bộ nhớ bị vượt giới hạn do tạo danh sách hoặc dữ liệu quá lớn.`;
      break;
    case 'FileNotFoundError':
      message = `Lỗi tệp tin (FileNotFoundError): ${detail || 'Không tìm thấy tệp đầu vào/đầu ra quy định.'}`;
      break;
    case 'EOFError':
      message = `Lỗi hết dữ liệu (EOFError): Lệnh input() cố đọc thêm nhưng dữ liệu đầu vào của bài kiểm tra đã kết thúc.`;
      break;
    case 'Timeout':
      message = `Quá thời gian (Time Limit Exceeded): Chương trình chạy quá thời gian cho phép (có thể do vòng lặp vô hạn while True hoặc thuật toán chưa tối ưu).`;
      break;
    default:
      message = `Lỗi thực thi (${errorType}): ${detail || 'Chương trình gặp lỗi khi chạy.'}`;
      break;
  }

  if (line !== undefined) {
    message = `[Dòng ${line}] ${message}`;
  }

  return {
    errorType,
    line,
    message,
    original,
  };
}

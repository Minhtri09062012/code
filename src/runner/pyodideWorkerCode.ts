// Mã nguồn chạy bên trong Web Worker của Pyodide
// Nạp Pyodide qua CDN jsDelivr v0.26.4
export const PYODIDE_WORKER_SCRIPT = `
let pyodide = null;
let isLoading = false;
let loadError = null;

async function initPyodide() {
  if (pyodide) return pyodide;
  if (isLoading) {
    while (isLoading) {
      await new Promise((r) => setTimeout(r, 100));
    }
    if (pyodide) return pyodide;
    throw loadError || new Error("Không thể khởi tạo Pyodide");
  }

  isLoading = true;
  try {
    importScripts("https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js");
    // @ts-ignore
    pyodide = await loadPyodide({
      indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/",
    });
    isLoading = false;
    return pyodide;
  } catch (err) {
    isLoading = false;
    loadError = err;
    throw new Error(
      "Không thể nạp trình chạy Python Pyodide từ CDN. Vui lòng kiểm tra kết nối mạng Internet để tải môi trường biên dịch."
    );
  }
}

self.onmessage = async (e) => {
  const { id, type, payload } = e.data;

  if (type === "INIT") {
    try {
      await initPyodide();
      self.postMessage({ id, type: "INIT_OK" });
    } catch (err) {
      self.postMessage({
        id,
        type: "INIT_ERROR",
        error: err && err.message ? err.message : String(err),
      });
    }
    return;
  }

  if (type === "EXEC_TEST") {
    try {
      const py = await initPyodide();
      const { code, input, ioMode, maxOutputLen = 50000 } = payload;

      // Chuẩn bị biến trong Python
      py.globals.set("__test_input__", input || "");
      py.globals.set("__user_code__", code || "");
      py.globals.set("__max_output_len__", maxOutputLen);

      let runnerPython = "";

      if (ioMode && ioMode.kind === "file") {
        py.globals.set("__input_file__", ioMode.inputFile);
        py.globals.set("__output_file__", ioMode.outputFile);

        runnerPython = \`
import sys, io, os

# Ghi input vào virtual file
with open(__input_file__, 'w', encoding='utf-8') as f:
    f.write(__test_input__)

# Xóa output cũ nếu có
if os.path.exists(__output_file__):
    try:
        os.remove(__output_file__)
    except Exception:
        pass

_stdout_buf = io.StringIO()
sys.stdout = _stdout_buf
sys.stderr = _stdout_buf

_clean_globals = {
    '__name__': '__main__',
    '__file__': 'solution.py'
}

try:
    _code_obj = compile(__user_code__, 'solution.py', 'exec')
    exec(_code_obj, _clean_globals)
except Exception as e:
    raise e

if not os.path.exists(__output_file__):
    raise FileNotFoundError(f"Không tìm thấy tệp đầu ra '{__output_file__}'. Hãy đảm bảo code ghi kết quả vào đúng tên tệp quy định.")

with open(__output_file__, 'r', encoding='utf-8') as f:
    _result_out = f.read()

if len(_result_out) > __max_output_len__:
    _result_out = _result_out[:__max_output_len__] + "\\n... [Đầu ra bị cắt bớt do quá dài]"

_result_out
\`;
      } else {
        // stdio mode
        runnerPython = \`
import sys, io, builtins

_in_stream = io.StringIO(__test_input__)
def _mock_input(prompt=''):
    line = _in_stream.readline()
    if not line:
        raise EOFError("EOF when reading a line")
    return line.rstrip('\\r\\n')

sys.stdin = _in_stream
builtins.input = _mock_input
_out_stream = io.StringIO()
sys.stdout = _out_stream
sys.stderr = _out_stream

_clean_globals = {
    '__name__': '__main__',
    '__file__': '<stdin>'
}

_code_obj = compile(__user_code__, '<stdin>', 'exec')
exec(_code_obj, _clean_globals)

_result_out = _out_stream.getvalue()
if len(_result_out) > __max_output_len__:
    _result_out = _result_out[:__max_output_len__] + "\\n... [Đầu ra bị cắt bớt do quá dài]"

_result_out
\`;
      }

      const rawResult = py.runPython(runnerPython);
      self.postMessage({
        id,
        type: "EXEC_TEST_OK",
        output: String(rawResult !== undefined ? rawResult : ""),
      });
    } catch (err) {
      self.postMessage({
        id,
        type: "EXEC_TEST_ERROR",
        error: err && err.message ? err.message : String(err),
      });
    }
    return;
  }

  if (type === "EXEC_TRACE") {
    try {
      const py = await initPyodide();
      const { code, input, maxSteps = 500 } = payload;

      py.globals.set("__test_input__", input || "");
      py.globals.set("__user_code__", code || "");
      py.globals.set("__max_steps__", maxSteps);

      const tracePython = \`
import sys, io, builtins, json

_in_stream = io.StringIO(__test_input__)
def _mock_input(prompt=''):
    line = _in_stream.readline()
    if not line:
        raise EOFError("EOF when reading a line")
    return line.rstrip('\\r\\n')

sys.stdin = _in_stream
builtins.input = _mock_input
_out_stream = io.StringIO()
sys.stdout = _out_stream

_steps = []
_step_count = 0
_ops_count = 0

def _truncate_val(val, max_len=40):
    try:
        r = repr(val)
        if len(r) > max_len:
            return r[:max_len-3] + '...'
        return r
    except:
        return '<?>'

def _extract_vars(locals_dict):
    res = {}
    for k, v in locals_dict.items():
        if k.startswith('_') or callable(v) or type(v).__name__ in ('module', 'function', 'type'):
            continue
        if isinstance(v, (int, float, bool, str, list, tuple, dict, set)) or v is None:
            res[k] = _truncate_val(v, 40)
    return res

def _find_lists(locals_dict):
    arr_names = []
    for k, v in locals_dict.items():
        if not k.startswith('_') and isinstance(v, (list, tuple)):
            arr_names.append(k)
    return arr_names

def _trace_dispatch(frame, event, arg):
    global _step_count, _ops_count
    if _step_count >= __max_steps__:
        sys.settrace(None)
        return None

    if event == 'line':
        co = frame.f_code
        if co.co_filename == '<user_code>':
            _step_count += 1
            _ops_count += 1
            line_no = frame.f_lineno
            f_vars = _extract_vars(frame.f_locals)
            arrs = _find_lists(frame.f_locals)
            
            _steps.append({
                "line": line_no,
                "vars": f_vars,
                "ops": _ops_count,
                "arrays": arrs,
                "explain": f"Dòng {line_no}"
            })
    return _trace_dispatch

sys.settrace(_trace_dispatch)
_runtime_error = None
try:
    _code_obj = compile(__user_code__, '<user_code>', 'exec')
    exec(_code_obj, {'__name__': '__main__'})
except Exception as e:
    _runtime_error = f"{type(e).__name__}: {str(e)}"
finally:
    sys.settrace(None)

_final_output = _out_stream.getvalue()

json.dumps({
    "steps": _steps,
    "finalOutput": _final_output,
    "runtimeError": _runtime_error,
    "totalOps": _ops_count
}, ensure_ascii=False)
\`;

      const traceJson = py.runPython(tracePython);
      const parsed = JSON.parse(traceJson);
      self.postMessage({
        id,
        type: "EXEC_TRACE_OK",
        data: parsed,
      });
    } catch (err) {
      self.postMessage({
        id,
        type: "EXEC_TRACE_ERROR",
        error: err && err.message ? err.message : String(err),
      });
    }
    return;
  }
};
`;

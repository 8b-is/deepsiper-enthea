#!/usr/bin/env python3
"""Deterministic OpenAI-compatible chat-completions stub for keyless eval E2E.

Serves a canned assistant answer over SSE on /v1/chat/completions. The answer
defaults to a correct fizzbuzz implementation so the eval grader PASSes;
override with STUB_ANSWER or a file path in STUB_ANSWER_FILE. Pure stdlib.
"""

import json
import os
import re
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

DEFAULT_ANSWER = """def fizzbuzz(n):
    if n % 15 == 0:
        return "FizzBuzz"
    if n % 3 == 0:
        return "Fizz"
    if n % 5 == 0:
        return "Buzz"
    return str(n)
"""


def load_answer() -> str:
    path = os.environ.get("STUB_ANSWER_FILE")
    if path:
        with open(path, encoding="utf-8") as handle:
            return handle.read()
    return os.environ.get("STUB_ANSWER", DEFAULT_ANSWER)


class Handler(BaseHTTPRequestHandler):
    answer = load_answer()

    def log_message(self, _format, *_args):  # silence per-request logging
        pass

    def do_POST(self):  # noqa: N802 (http.server API)
        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length) if length else b"{}"
        try:
            request = json.loads(body)
        except json.JSONDecodeError:
            self.send_error(400, "invalid JSON")
            return
        if not re.search(r"/chat/completions$", self.path):
            self.send_error(404, "not a chat-completions route")
            return
        model = (request.get("model") or "entheai-ultra") if isinstance(request, dict) else "entheai-ultra"
        if not isinstance(model, str):
            model = "entheai-ultra"
        text = self.answer
        chunks = [
            {"choices": [{"delta": {"role": "assistant"}, "index": 0}]},
        ]
        for word in text.split(" "):
            chunks.append({"choices": [{"delta": {"content": word + " "}, "index": 0}]})
        chunks.append({"choices": [{"delta": {}, "finish_reason": "stop", "index": 0}]})
        payload = "\n".join(f"data: {json.dumps(c)}" for c in chunks) + "\ndata: [DONE]\n"
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(payload.encode("utf-8"))


def main() -> int:
    port = int(os.environ.get("STUB_PORT", "8000"))
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"stub chat-completions on http://127.0.0.1:{port}/v1", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())

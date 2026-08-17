Write a Python function `fizzbuzz(n)` that returns, for the single integer `n`:

- `"FizzBuzz"` when `n` is divisible by both 3 and 5
- `"Fizz"` when `n` is divisible by 3 but not 5
- `"Buzz"` when `n` is divisible by 5 but not 3
- the decimal string of `n` otherwise

Output ONLY the function source. No prose, no code fences, no module-level
calls, no `if __name__ == "__main__"` block. The grader `exec`s your source
and calls `fizzbuzz(1)` through `fizzbuzz(15)`, plus `30`, `45`, and `100`.

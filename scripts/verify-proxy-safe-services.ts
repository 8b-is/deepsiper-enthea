/**
 * Static gate: no service class registered on `ctx.<name>` may declare `#private` members.
 *
 * Cordis's traceable-context proxy re-invokes service methods with a shadow proxy as `this`, so a
 * `#private` field/method access throws `TypeError: Receiver must be an instance of <Class>` at
 * runtime — only when called through `ctx` (the path every consumer uses). A class is in scope when
 * it `extends Service` (a Cordis service) or when an instance of it is assigned to a `ctx.` slot.
 * Service authors use module-level helpers for private state.
 *
 * Exit codes: 0 clean, 1 violations found.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'

/** One flagged violation. */
export interface ProxySafetyViolation {
  /** Absolute file path. */
  readonly file: string
  /** 1-based line of the class declaration. */
  readonly line: number
  /** Class name. */
  readonly className: string
  /** Human message. */
  readonly message: string
}

/** Whether a class name is likely a Cordis service (extends Service). */
function isServiceHeritage(node: ts.ClassDeclaration, source: ts.SourceFile): boolean {
  if (node.heritageClauses === undefined) return false
  for (const clause of node.heritageClauses) {
    for (const type of clause.types) {
      const name = type.expression.getText(source)
      if (name === 'Service' || name.endsWith('.Service') || name.endsWith('Service')) return true
    }
  }
  return false
}

/** Whether the source assigns an instance of `className` to a `ctx.<name>` slot. */
function isCtxAssigned(source: ts.SourceFile, className: string): boolean {
  const text = source.getFullText()
  const patterns = [
    // ctx.quant = new Quant(...)
    new RegExp(`ctx\\s*\\.\\s*\\w+\\s*=\\s*new\\s+${className}\\b`),
    // ctx.quant = <var> where <var> is declared/typed as the class
    new RegExp('ctx\\s*\\.\\s*\\w+\\s*=\\s*[A-Za-z_$][\\w$]*\\b(?!\\s*\\()'),
  ]
  return patterns.some(pattern => pattern.test(text))
}

/**
 * Scan one TypeScript source for proxy-unsafe service classes.
 * @param source - the source text.
 * @param file - the file path used in violation reporting (may be a display path).
 * @returns the violations found in this source.
 */
export function scanServiceClasses(source: string, file: string): ProxySafetyViolation[] {
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  const violations: ProxySafetyViolation[] = []
  const visit = (node: ts.Node): void => {
    if (ts.isClassDeclaration(node) && node.name !== undefined) {
      const className = node.name.text
      const hasPrivate = node.members.some(
        member => (ts.isPropertyDeclaration(member) || ts.isMethodDeclaration(member)) &&
          ts.isPrivateIdentifier(member.name),
      )
      if (hasPrivate && (isServiceHeritage(node, sourceFile) || isCtxAssigned(sourceFile, className))) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
        violations.push({
          file,
          line: line + 1,
          className,
          message: `${className} uses #private but is registered on ctx (proxy-unsafe)`,
        })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return violations
}

/** Recursively collect `.ts` source files under a directory, excluding node_modules/lib/tests. */
function collectSources(root: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'lib' || entry.name === 'tests' || entry.name === '.git') continue
      out.push(...collectSources(path))
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      out.push(path)
    }
  }
  return out
}

/** Run the gate over `packages/<group>/<pkg>/src` TypeScript files. */
export function scanRepo(root: string): ProxySafetyViolation[] {
  const packagesDir = join(root, 'packages')
  const files = collectSources(packagesDir)
  const violations: ProxySafetyViolation[] = []
  for (const file of files) {
    const source = readFileSync(file, 'utf8')
    violations.push(...scanServiceClasses(source, file))
  }
  return violations
}

/** CLI entry. */
function main(): void {
  const root = process.cwd()
  const violations = scanRepo(root)
  if (violations.length > 0) {
    for (const violation of violations) {
      console.error(`${relative(root, violation.file)}:${violation.line}: ${violation.message}`)
    }
    console.error(`verify-proxy-safe-services: ${violations.length} proxy-unsafe service class(es) found.`)
    process.exitCode = 1
    return
  }
  console.log('verify-proxy-safe-services: service classes proxy-safe.')
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}

---
name: typescript-patterns
description:
  Use this skill whenever writing, editing, reviewing, or debugging TypeScript
  code, especially in React or Next.js projects. It helps with practical
  TypeScript patterns, type-safe component props, server/client data shapes, API
  contracts, schema-derived types, narrowing unknown data, avoiding any,
  choosing type over interface, using satisfies/as const, optional chaining,
  nullish coalescing, generics, discriminated unions, exhaustive switches,
  mapped/conditional/template literal types, reusable type utilities, and
  compile-time safety. Trigger even when the user does not explicitly ask for
  "advanced types" if the task touches .ts/.tsx files, TypeScript errors, type
  inference, props, actions, loaders, API clients, forms, database rows,
  Zod/Drizzle schemas, or refactoring JavaScript into TypeScript.
---

# TypeScript Patterns

Practical guidance for writing, reviewing, debugging, and refactoring TypeScript
code with strong compile-time safety. Use these patterns for everyday `.ts` and
`.tsx` work as well as advanced type system design.

## When to Use This Skill

- Writing or editing TypeScript files
- Fixing TypeScript compiler errors
- Reviewing `.ts` or `.tsx` code for type safety
- Designing React component props
- Typing Server Actions, route handlers, loaders, or API clients
- Deriving types from Zod, Drizzle, database rows, or external schemas
- Narrowing `unknown` data from external boundaries
- Refactoring JavaScript to TypeScript
- Building type-safe libraries or frameworks
- Creating reusable generic components
- Implementing complex type inference logic
- Building form validation systems
- Creating strongly-typed configuration objects
- Implementing type-safe state management

## Project Conventions

### Naming Conventions

- **Types:** `PascalCase`
- **Files:** `kebab-case.ts` / `kebab-case.tsx`

### Use `type` Over `interface`

Prefer `type` aliases for consistency. Use `interface` only when declaration
merging is needed.

```typescript
// ✅ Good
type User = {
	id: string
	name: string
	email: string
}

type ApiResponse<T> = {
	data: T
	status: number
}

// ❌ Avoid
interface User {
	id: string
	name: string
	email: string
}
```

### Use `satisfies` and `as const`

Use `satisfies` to validate types while preserving literal inference. Use
`as const` for immutable literal types.

```typescript
// ✅ Good: satisfies validates while preserving narrow types
const config = {
	apiUrl: 'https://api.no',
	timeout: 5000,
	retries: 3,
} as const satisfies {
	apiUrl: string
	timeout: number
	retries: number
}

// config.apiUrl is typed as 'https://api.no', not string

// ✅ Good: as const for literal unions
const STATUS = {
	PENDING: 'pending',
	ACTIVE: 'active',
	COMPLETED: 'completed',
} as const

type Status = (typeof STATUS)[keyof typeof STATUS] // 'pending' | 'active' | 'completed'

// ❌ Avoid: loses literal types
const config = {
	apiUrl: 'https://api.no',
} // apiUrl is string, not the literal
```

### Maximize Type Inference

Let TypeScript infer types. Don't annotate what the compiler already knows.

```typescript
// ✅ Good: inferred return type
function getUser(id: string) {
	return { id, name: 'John', createdAt: new Date() }
}

// ✅ Good: inferred const type
const count = 42
const items = ['a', 'b', 'c']

// ❌ Avoid: redundant annotations
function getUser(id: string): { id: string; name: string; createdAt: Date } {
	return { id, name: 'John', createdAt: new Date() }
}

const count: number = 42
const items: string[] = ['a', 'b', 'c']
```

### Never Use `any`

Use `unknown` when the type is truly unknown. Use proper types or generics
otherwise.

```typescript
// ✅ Good: unknown for truly unknown values
function parseJson(text: string): unknown {
	return JSON.parse(text)
}

// ✅ Good: generic for flexible but typed functions
function identity<T>(value: T): T {
	return value
}

// ✅ Good: narrow unknown with type guards
function processValue(value: unknown) {
	if (typeof value === 'string') {
		return value.toUpperCase()
	}
	if (isUser(value)) {
		return value.name
	}
	throw new Error('Unexpected value type')
}

// ❌ Never
function parseJson(text: string): any {
	return JSON.parse(text)
}
```

### Use Optional Chaining

Use `?.` for safe property access on potentially undefined values.

```typescript
// ✅ Good
const userName = user?.profile?.name
const firstItem = items?.[0]
const result = callback?.()

// ❌ Avoid
const userName = user && user.profile && user.profile.name
const firstItem = items && items[0]
const result = callback && callback()
```

### Use Nullish Coalescing

Use `??` to provide defaults for `null` or `undefined` only. Use `||` only when
falsy values should also trigger the default.

```typescript
// ✅ Good: ?? only replaces null/undefined
const displayName = user.name ?? 'Guest'
const count = settings.count ?? 0 // 0 is preserved
const enabled = config.enabled ?? true // false is preserved

// ❌ Avoid: || replaces all falsy values
const count = settings.count || 10 // 0 becomes 10!
const enabled = config.enabled || true // false becomes true!
```

## Type Organization

### Centralized `src/types/` Folder

For shared, cross-cutting types used across multiple modules, use a centralized
`src/types/` folder with domain-based files and a barrel export.

```
src/types/
├── auth.ts          # Auth-related types
├── queue.ts         # Queue-related types
└── index.ts         # Barrel export
```

```typescript
// src/types/auth.ts
import type { userTypes } from '@/constants'

type UserType = (typeof userTypes)[keyof typeof userTypes]

export type AuthCredentials = {
	id: string
	userType: UserType
}

export type Auth = {
	credentials: AuthCredentials
}
```

```typescript
// src/types/index.ts
export * from './auth.js'
export * from './queue.js'
```

### Guidelines

- **Cross-cutting types** (`Auth`, `Queue`) go in `src/types/` — they're used
  across many files
- **Module-specific types** used in a single file can stay inline — no need to
  force them into the folder
- **Derive types from constants** using `typeof` + `keyof typeof` instead of
  duplicating string literals
- **Use `Pick` for narrowing** — when a function only needs part of a type, use
  `Pick<Queue, 'crm'>` to keep it loosely coupled
- **Use `.js` extensions** in barrel exports to match the project's ESM module
  resolution

### Extract Object Parameter Types

When a parameter, return value, or local is an object — **including
single-property objects** — declare a named `type` rather than inlining the
shape. Place it next to the function it serves; export only if another file
needs it. The rule applies to `{ id }: { id: string }` just as it does to
multi-property shapes; consistency beats saving one line.

**Always write the type body on multiple lines**, one property per line, even if
it would fit on a single line. Biome's `lineWidth` is wide enough to leave
compact types alone, so the skill — not the formatter — has to enforce this.

Name the type by its role relative to the function — default to `<Fn>Params`
(the convention already used most in this codebase). Don't name it after what
the function produces; `FilterEvent` would read like the return type. If the
shape is reused across multiple functions, name it by the data instead (e.g.
`FilterSelection`).

```ts
// ✅ Good
type FilterEventParams = {
  filterName: string;
  filterValue: string | number | boolean;
};
const filterEvent = ({ filterName, filterValue }: FilterEventParams) => ({ ... });

// ❌ Avoid: inline shape
const filterEvent = ({ filterName, filterValue }: { filterName: string; filterValue: string | number | boolean }) => ({ ... });

// ❌ Avoid: single-line type body
type FilterEventParams = { filterName: string; filterValue: string | number | boolean };
```

```typescript
// ✅ Good: derive from the source of truth
import type { userTypes } from '@/constants'
type UserType = (typeof userTypes)[keyof typeof userTypes]

// ❌ Avoid: duplicating values as a union
type UserType = 'seller' | 'client' | 'dealer' | 'admin'
```

```typescript
// ✅ Good: narrow with Pick — function only needs crm
function logEvent(queue: Pick<Queue, 'crm'>) { ... }

// ❌ Avoid: requiring the full type when only one property is used
function logEvent(queue: Queue) { ... }
```

### Prefer Existing Canonical Types Over Inline Shapes

When a parameter, return value, or local needs an object type, **first check
whether a type in `src/types/*` already declares the properties you access with
the same value types**. If one does, derive the parameter from it — don't
re-declare the shape inline.

**Default to `Pick`**, not the full type. The function should accept the
narrowest canonical type that covers the access. This keeps the signature honest
about what the function touches and keeps tests/callers ergonomic.

If multiple canonical types declare the same properties, prefer the
**narrowest** — the type closest to the concept the function operates on. Fall
back to inline shapes only when no canonical type covers the access.

```ts
// ✅ Good: derive from the canonical type
import type { Order } from '~/types/order';
const getOrderTotal = (order: Pick<Order, 'lineItems'>) => { ... };

// ❌ Avoid: re-declaring a shape that already exists in src/types/*
import type { LineItem } from '~/types/order';
const getOrderTotal = (order: { lineItems: LineItem[] }) => { ... };

// ❌ Avoid: full type when only one or two properties are used
const getOrderTotal = (order: Order) => { ... };
```

## Core Concepts

### 1. Generics

**Purpose:** Create reusable, type-flexible components while maintaining type
safety.

**Basic Generic Function:**

```typescript
function identity<T>(value: T): T {
	return value
}

const num = identity<number>(42) // Type: number
const str = identity<string>('hello') // Type: string
const auto = identity(true) // Type inferred: boolean
```

**Generic Constraints:**

```typescript
type HasLength = {
	length: number
}

function logLength<T extends HasLength>(item: T): T {
	console.log(item.length)
	return item
}

logLength('hello') // OK: string has length
logLength([1, 2, 3]) // OK: array has length
logLength({ length: 10 }) // OK: object has length
// logLength(42);             // Error: number has no length
```

**Multiple Type Parameters:**

```typescript
function merge<T, U>(obj1: T, obj2: U): T & U {
	return { ...obj1, ...obj2 }
}

const merged = merge({ name: 'John' }, { age: 30 })
// Type: { name: string } & { age: number }
```

### 2. Conditional Types

**Purpose:** Create types that depend on conditions, enabling sophisticated type
logic.

**Basic Conditional Type:**

```typescript
type IsString<T> = T extends string ? true : false

type A = IsString<string> // true
type B = IsString<number> // false
```

**Extracting Return Types:**

```typescript
type ReturnType<T> = T extends (...args: any[]) => infer R ? R : never

function getUser() {
	return { id: 1, name: 'John' }
}

type User = ReturnType<typeof getUser>
// Type: { id: number; name: string; }
```

**Distributive Conditional Types:**

```typescript
type ToArray<T> = T extends any ? T[] : never

type StrOrNumArray = ToArray<string | number>
// Type: string[] | number[]
```

**Nested Conditions:**

```typescript
type TypeName<T> = T extends string
	? 'string'
	: T extends number
		? 'number'
		: T extends boolean
			? 'boolean'
			: T extends undefined
				? 'undefined'
				: T extends Function
					? 'function'
					: 'object'

type T1 = TypeName<string> // "string"
type T2 = TypeName<() => void> // "function"
```

### 3. Mapped Types

**Purpose:** Transform existing types by iterating over their properties.

**Basic Mapped Type:**

```typescript
type Readonly<T> = {
	readonly [P in keyof T]: T[P]
}

type User = {
	id: number
	name: string
}

type ReadonlyUser = Readonly<User>
// Type: { readonly id: number; readonly name: string; }
```

**Optional Properties:**

```typescript
type Partial<T> = {
	[P in keyof T]?: T[P]
}

type PartialUser = Partial<User>
// Type: { id?: number; name?: string; }
```

**Key Remapping:**

```typescript
type Getters<T> = {
	[K in keyof T as `get${Capitalize<string & K>}`]: () => T[K]
}

type Person = {
	name: string
	age: number
}

type PersonGetters = Getters<Person>
// Type: { getName: () => string; getAge: () => number; }
```

**Filtering Properties:**

```typescript
type PickByType<T, U> = {
	[K in keyof T as T[K] extends U ? K : never]: T[K]
}

type Mixed = {
	id: number
	name: string
	age: number
	active: boolean
}

type OnlyNumbers = PickByType<Mixed, number>
// Type: { id: number; age: number; }
```

### 4. Template Literal Types

**Purpose:** Create string-based types with pattern matching and transformation.

**Basic Template Literal:**

```typescript
type EventName = 'click' | 'focus' | 'blur'
type EventHandler = `on${Capitalize<EventName>}`
// Type: "onClick" | "onFocus" | "onBlur"
```

**String Manipulation:**

```typescript
type UppercaseGreeting = Uppercase<'hello'> // "HELLO"
type LowercaseGreeting = Lowercase<'HELLO'> // "hello"
type CapitalizedName = Capitalize<'john'> // "John"
type UncapitalizedName = Uncapitalize<'John'> // "john"
```

**Path Building:**

```typescript
type Path<T> = T extends object
	? {
			[K in keyof T]: K extends string ? `${K}` | `${K}.${Path<T[K]>}` : never
		}[keyof T]
	: never

type Config = {
	server: {
		host: string
		port: number
	}
	database: {
		url: string
	}
}

type ConfigPath = Path<Config>
// Type: "server" | "database" | "server.host" | "server.port" | "database.url"
```

### 5. Utility Types

**Built-in Utility Types:**

```typescript
// Partial<T> - Make all properties optional
type PartialUser = Partial<User>

// Required<T> - Make all properties required
type RequiredUser = Required<PartialUser>

// Readonly<T> - Make all properties readonly
type ReadonlyUser = Readonly<User>

// Pick<T, K> - Select specific properties
type UserName = Pick<User, 'name' | 'email'>

// Omit<T, K> - Remove specific properties
type UserWithoutPassword = Omit<User, 'password'>

// Exclude<T, U> - Exclude types from union
type T1 = Exclude<'a' | 'b' | 'c', 'a'> // "b" | "c"

// Extract<T, U> - Extract types from union
type T2 = Extract<'a' | 'b' | 'c', 'a' | 'b'> // "a" | "b"

// NonNullable<T> - Exclude null and undefined
type T3 = NonNullable<string | null | undefined> // string

// Record<K, T> - Create object type with keys K and values T
type PageInfo = Record<'home' | 'about', { title: string }>
```

## Advanced Patterns

### Pattern 1: Deep Readonly/Partial

```typescript
type DeepReadonly<T> = {
	readonly [P in keyof T]: T[P] extends object
		? T[P] extends Function
			? T[P]
			: DeepReadonly<T[P]>
		: T[P]
}

type DeepPartial<T> = {
	[P in keyof T]?: T[P] extends object
		? T[P] extends Array<infer U>
			? Array<DeepPartial<U>>
			: DeepPartial<T[P]>
		: T[P]
}

type Config = {
	server: {
		host: string
		port: number
		ssl: {
			enabled: boolean
			cert: string
		}
	}
	database: {
		url: string
		pool: {
			min: number
			max: number
		}
	}
}

type ReadonlyConfig = DeepReadonly<Config>
// All nested properties are readonly

type PartialConfig = DeepPartial<Config>
// All nested properties are optional
```

### Pattern 2: Type-Safe Form Validation

```typescript
import * as z from 'zod'

const loginFormSchema = z.object({
	email: z
		.email({ error: 'Email must be valid' })
		.min(1, { error: 'Email is required' }),
	password: z
		.string()
		.min(8, { error: 'Password must be at least 8 characters' }),
})

type LoginForm = z.infer<typeof loginFormSchema>

function validateLoginForm(data: LoginForm) {
	const result = loginFormSchema.safeParse(data)
	return result.success ? null : result.error.flatten().fieldErrors
}

// Usage
const errors = validateLoginForm({ email: 'invalid', password: 'short' })
// { email?: string[]; password?: string[]; } | null
```

## Type Inference Techniques

### 1. Infer Keyword

```typescript
// Extract array element type
type ElementType<T> = T extends (infer U)[] ? U : never

type NumArray = number[]
type Num = ElementType<NumArray> // number

// Extract promise type
type PromiseType<T> = T extends Promise<infer U> ? U : never

type AsyncNum = PromiseType<Promise<number>> // number

// Extract function parameters
type Parameters<T> = T extends (...args: infer P) => any ? P : never

function foo(a: string, b: number) {}
type FooParams = Parameters<typeof foo> // [string, number]
```

### 2. Type Guards

```typescript
function isString(value: unknown): value is string {
	return typeof value === 'string'
}

function isArrayOf<T>(
	value: unknown,
	guard: (item: unknown) => item is T,
): value is T[] {
	return Array.isArray(value) && value.every(guard)
}

const data: unknown = ['a', 'b', 'c']

if (isArrayOf(data, isString)) {
	data.forEach((s) => s.toUpperCase()) // Type: string[]
}
```

### 3. Assertion Functions

```typescript
function assertIsString(value: unknown): asserts value is string {
	if (typeof value !== 'string') {
		throw new Error('Not a string')
	}
}

function processValue(value: unknown) {
	assertIsString(value)
	// value is now typed as string
	console.log(value.toUpperCase())
}
```

## Best Practices

1. **Use `unknown` over `any`**: Enforce type checking
2. **Prefer `type` over `interface`**: More consistent, use `interface` only for
   declaration merging
3. **Leverage type inference**: Let TypeScript infer when possible, don't
   annotate obvious types
4. **Use `satisfies` and `as const`**: Preserve literal types while validating
   structure
5. **Use optional chaining (`?.`)**: Safe property access on potentially
   undefined values
6. **Use nullish coalescing (`??`)**: Provide defaults only for
   `null`/`undefined`, not falsy values
7. **Create helper types**: Build reusable type utilities
8. **Avoid type assertions**: Use type guards instead
9. **Use strict mode**: Enable all strict compiler options
10. **Test your types**: Use type tests to verify type behavior

## Type Testing

```typescript
// Type assertion tests
type AssertEqual<T, U> = [T] extends [U]
	? [U] extends [T]
		? true
		: false
	: false

type Test1 = AssertEqual<string, string> // true
type Test2 = AssertEqual<string, number> // false
type Test3 = AssertEqual<string | number, string> // false

// Expect error helper
type ExpectError<T extends never> = T

// Example usage
type ShouldError = ExpectError<AssertEqual<string, number>>
```

## Common Pitfalls

1. **Over-using `any`**: Defeats the purpose of TypeScript
2. **Ignoring strict null checks**: Can lead to runtime errors
3. **Too complex types**: Can slow down compilation
4. **Not using discriminated unions**: Misses type narrowing opportunities
5. **Forgetting readonly modifiers**: Allows unintended mutations
6. **Circular type references**: Can cause compiler errors
7. **Not handling edge cases**: Like empty arrays or null values

## Performance Considerations

- Avoid deeply nested conditional types
- Use simple types when possible
- Cache complex type computations
- Limit recursion depth in recursive types
- Use build tools to skip type checking in production

## Resources

- **TypeScript Handbook**: https://www.typescriptlang.org/docs/handbook/
- **Type Challenges**: https://github.com/type-challenges/type-challenges
- **TypeScript Deep Dive**: https://basarat.gitbook.io/typescript/
- **Effective TypeScript**: Book by Dan Vanderkam

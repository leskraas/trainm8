---
name: react-patterns
description:
  React conventions for consistent, maintainable components. Use this skill for
  ANY task that involves writing or modifying React components or hooks in this
  codebase — including building new features, creating .tsx files, reviewing
  existing components, or implementing a design. This skill must be consulted
  before writing new component code, even when the user doesn't mention
  conventions — it covers the design system component library (always check
  before building from scratch), file naming, function style, hook patterns, and
  Tailwind/cn() usage.
---

# React Patterns

---

## Naming Conventions

- **Component files:** `kebab-case.tsx`
- **Component functions:** `PascalCase`
- **Hook files:** `use-kebab-case.ts`
- **Hook functions:** `useCamelCase`
- **Util files:** `kebab-case.ts`

## Functions

Prefer regular functions over arrow functions (except for inline/callback
functions):

```tsx
// ✅ Good: regular function
function handleClick() {
	doSomething()
}

// ✅ Good: arrow for inline callbacks
items.map((item) => <Item key={item.id} {...item} />)

// ❌ Avoid: arrow for component-level functions
const handleClick = () => {
	doSomething()
}
```

Use objects over many arguments:

```tsx
// ✅ Good
function createUser({ name, email, role }: CreateUserParams) {}

// ❌ Avoid
function createUser(name: string, email: string, role: string) {}
```

## CSS & Tailwind

- Use **Tailwind CSS** for styling
- Use `cn()` helper from `~/lib/utils` for conditional classes
- **Never** use manual array joins or `clsx` directly
- **Never** create new `.scss` files (migrating away)

```tsx
// ✅ Good
<div className={cn('base-class', { 'active': isActive })} />

// ❌ Avoid
<div className={['base-class', isActive && 'active'].filter(Boolean).join(' ')} />
<div className={clsx('base-class', { 'active': isActive })} />
```

## Avoid useEffect

[You Might Not Need `useEffect`](https://react.dev/learn/you-might-not-need-an-effect)

Instead of `useEffect`, prefer: ref callbacks, event handlers with `flushSync`,
CSS, `useSyncExternalStore`, etc.

```tsx
// ✅ Good: Handle side effects in event handlers
function ProductPage({ product, addToCart }) {
	function buyProduct() {
		addToCart(product)
		showNotification(`Added ${product.name} to the shopping cart!`)
	}

	function handleBuyClick() {
		buyProduct()
	}

	function handleCheckoutClick() {
		buyProduct()
		navigateTo('/checkout')
	}
}

// ❌ Avoid: useEffect for logic that belongs in event handlers
function ProductPage({ product, addToCart }) {
	useEffect(() => {
		if (product.isInCart) {
			showNotification(`Added ${product.name} to the shopping cart!`)
		}
	}, [product])

	function handleBuyClick() {
		addToCart(product)
	}

	function handleCheckoutClick() {
		addToCart(product)
		navigateTo('/checkout')
	}
}
```

### When useEffect is appropriate

Use `useEffect` for synchronizing with external systems (event listeners,
subscriptions, browser APIs):

```tsx
// ✅ Good: External event listener subscription
useEffect(() => {
	const controller = new AbortController()

	window.addEventListener(
		'keydown',
		(event: KeyboardEvent) => {
			if (event.key !== 'Escape') return
			// handle escape key
		},
		{ signal: controller.signal },
	)

	return () => {
		controller.abort()
	}
}, [])
```

## useMemo and useCallback

**Only use as performance optimization.** If your code doesn't work without
them, find the underlying problem and fix it first.

### When NOT to use

- **Passing to unmemoized components** - If the child component lacks
  `React.memo()`, it won't benefit from stable references
- **No measured performance issue** - Without evidence of slow renders (>16ms),
  memoization adds complexity without benefit
- **Unstable dependencies** - If dependencies include props, the memoization
  chain becomes fragile

```tsx
// ❌ Avoid: Memoizing for unmemoized component
function Parent() {
	const handleClick = useCallback(() => doSomething(), [])
	return <Child onClick={handleClick} /> // Pointless if Child isn't React.memo'd
}

// ❌ Avoid: Using to "fix" broken code
const value = useMemo(() => computeValue(dep), [dep]) // If removing this breaks the app, fix the real issue
```

### When to use

Only memoize when you can answer "yes" to: **Will this actually prevent
something expensive from happening?**

```tsx
// ✅ Good: Expensive computation with stable deps
const expensiveResult = useMemo(() => heavyComputation(data), [data])

// ✅ Good: Stable reference for React.memo'd child
const MemoizedChild = React.memo(Child)
function Parent() {
	const handleClick = useCallback(() => doSomething(), [])
	return <MemoizedChild onClick={handleClick} />
}
```

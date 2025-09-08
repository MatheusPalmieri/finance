# 🚀 Professional Next.js Template

A complete and professional Next.js template following industry best practices, configured with all
essential tools for modern development.

## ✨ Features

### 🛠️ Tech Stack

- **[Next.js 15](https://nextjs.org)** - React framework with App Router
- **[React 19](https://react.dev)** - User interface library
- **[TypeScript](https://www.typescriptlang.org)** - Static typing
- **[Tailwind CSS](https://tailwindcss.com)** - Utility-first CSS framework

### 🎯 Code Quality

- **[ESLint](https://eslint.org)** - Linting with custom rules
- **[Prettier](https://prettier.io)** - Automatic code formatting
- **[Husky](https://typicode.github.io/husky)** - Git hooks for automation
- **[lint-staged](https://github.com/okonet/lint-staged)** - Lint only staged files
- **[Commitlint](https://commitlint.js.org)** - Conventional commit standard

### 🏗️ Architecture

- **Feature-based structure** - Scalable organization
- **Reusable components** - Consistent UI
- **Custom hooks** - Shared logic
- **Utilities** - Helper functions
- **TypeScript paths** - Clean imports with @/\*

## 📁 Project Structure

```
src/
├── app/                 # Next.js App Router
│   ├── layout.tsx      # Main layout
│   └── page.tsx        # Home page
├── components/          # Reusable components
│   ├── ui/             # Basic UI components
│   └── forms/          # Form components
├── features/           # Features organized by domain
│   └── home/           # Home page feature
├── lib/                # Utilities and configurations
├── hooks/              # Custom hooks
├── types/              # Global type definitions
├── styles/             # Global styles
└── constants/          # Application constants
```

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- pnpm (recommended)

### Installation

1. **Clone the repository**

   ```bash
   git clone <your-repository>
   cd template-next
   ```

2. **Install dependencies**

   ```bash
   pnpm install
   ```

3. **Configure environment variables**

   ```bash
   cp env.example .env.local
   # Edit .env.local file with your configurations
   ```

4. **Run the project**

   ```bash
   pnpm dev
   ```

5. **Open browser** Access [http://localhost:3000](http://localhost:3000)

## 📝 Available Scripts

- `pnpm dev` - Start development server
- `pnpm build` - Generate production build
- `pnpm start` - Start production server
- `pnpm lint` - Run linting
- `pnpm lint:fix` - Fix linting issues automatically
- `pnpm format` - Format all code
- `pnpm format:check` - Check formatting
- `pnpm type-check` - Check TypeScript types
- `pnpm validate` - Run all validations
- `pnpm clean` - Clean build files

## 🎨 Code Standards

### Commits

This project uses [Conventional Commits](https://www.conventionalcommits.org/):

```bash
feat: add new feature
fix: fix bug
docs: update documentation
style: style/formatting changes
refactor: code refactoring
test: add or modify tests
chore: maintenance tasks
```

### Imports

Use absolute imports with `@/` alias:

```typescript
// ✅ Good
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/utils'

// ❌ Avoid
import { Button } from '../../../components/ui/button'
```

### Components

Follow naming conventions:

```typescript
// ✅ Components in PascalCase
export function UserProfile() {}

// ✅ Hooks in camelCase with 'use' prefix
export function useLocalStorage() {}

// ✅ Utilities in camelCase
export function formatCurrency() {}
```

## 🛡️ Git Hooks

This template includes automatic hooks that run:

- **pre-commit**: Format and lint modified files
- **commit-msg**: Validate message follows conventional pattern

## 🎯 Included Components

### Button

Button component with variations:

```tsx
import { Button } from '@/components/ui/button';

<Button variant="default" size="lg">
  Click here
</Button>;
```

### useLocalStorage

Hook for managing localStorage:

```tsx
import { useLocalStorage } from '@/hooks/use-local-storage';

const [value, setValue, removeValue] = useLocalStorage('key', 'default');
```

## 🌐 Deploy

### Vercel (Recommended)

1. Connect your repository to [Vercel](https://vercel.com)
2. Configure environment variables
3. Automatic deployment on every push

### Other Providers

- **Netlify**: `pnpm build && pnpm export`
- **Railway**: Automatic configuration
- **Docker**: Dockerfile included (if needed)

## 🤝 Contributing

1. Fork the project
2. Create a branch for your feature (`git checkout -b feat/new-feature`)
3. Commit your changes (`git commit -m 'feat: add new feature'`)
4. Push to the branch (`git push origin feat/new-feature`)
5. Open a Pull Request

## 📄 License

This project is under the MIT license. See the [LICENSE](LICENSE) file for more details.

## 🙏 Acknowledgments

- [Next.js Team](https://nextjs.org) - Amazing framework
- [Vercel](https://vercel.com) - Platform and tools
- [Tailwind CSS](https://tailwindcss.com) - CSS framework
- Open source community

---

Made with ❤️ for the developer community.

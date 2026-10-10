This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Authentication (`APPSTORE_AUTH_ENABLED`)

- `APPSTORE_AUTH_ENABLED=true|1|yes` forces App Store session auth on; `false|0|no` turns it off.
- When unset, production (`NODE_ENV=production`) defaults to auth **on** for every request, including `localhost`. Outside production, `localhost`/`127.0.0.1` requests skip auth.
- Running `next start` locally is a production build, so set `APPSTORE_AUTH_ENABLED=false` to use it without a session.

## AI providers (Claude primary, existing providers as fallback)

- `ANTHROPIC_API_KEY`: when set, Claude generates worksheet questions first. When unset or empty, Claude is skipped and generation runs exactly as before.
- `ANTHROPIC_MODEL` (default `claude-sonnet-5-5`), `ANTHROPIC_EFFORT` (`low`|`medium`|`high`|`xhigh`|`max`, default `low`), `ANTHROPIC_TIMEOUT_MS` (default `25000`, clamped to 5000-35000). Invalid values fall back to the defaults.
- Fallback order: Claude (at most 2 attempts) → the existing dual-mode providers (`WORKSHEET_MAKER_AI_MODE=dual`) or the legacy provider chain. Claude keeps 20 seconds of the shared 52-second budget free for the fallback.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

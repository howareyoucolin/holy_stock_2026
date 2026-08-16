---
name: blog-post
description: Write and publish a post to the HolyStocks blog. Use when the user asks to write, draft, publish or update a blog post, or to turn an analysis or a discussion into an article for the site.
---

# Publish a blog post

Posts go straight to the public site. There is no admin screen and no draft
state: a successful POST is live at `/post.php?slug=…` immediately. **Show the
user the draft and get their go-ahead before publishing.**

```bash
curl -sS -X POST https://stock.369usa.com/publish-post.php \
  -H 'Content-Type: application/json' \
  --data-binary @/tmp/post.json
```

Build `/tmp/post.json` with a script rather than by hand — the body is long and
must be JSON-escaped exactly. Read the key from `.secrets` at the project root
and put it in `secret`; never paste the key into a command line, a repo file, or
the chat.

| Field | Required | Notes |
|---|---|---|
| `secret` | yes | from `.secrets` (`publish_secret=…`) |
| `title` | yes | up to 200 characters |
| `body` | yes | markdown, see below |
| `categories` | no | up to 6 names, e.g. `["Method", "Risk"]` |
| `summary` | no | written from the body when omitted |
| `slug` | no | derived from the title when omitted |

The response carries `slug`, `url`, and `created` — `false` means an existing
post with that slug was **updated in place**. That is how to fix a typo: re-send
the whole post with the same slug. It is also the trap to avoid: two different
posts whose titles slugify the same will overwrite each other, so pass an
explicit `slug` when a title is close to an existing one.

## Markdown the site renders

Anything else is escaped and shown as literal text, so do not send HTML.

- `##` and `###` headings — `##` is the top level, since the title is the page's h1
- paragraphs, `**bold**`, `*italic*`, `` `code` ``
- `-` bullet lists and `1.` numbered lists
- `>` blockquotes
- ` ``` ` fenced code
- `---` horizontal rule
- `[text](url)` — `http`, `https`, `mailto`, or a site-relative `/path`. Other
  schemes are stripped to plain text.

## What a good post looks like here

The site's voice is the one the agents are asked for in `app/src/lib/prompts.js`:
plain words, short sentences, no throat-clearing, and a claim in the first two
lines rather than a preamble about what the post will cover.

- Open with the point. If the first paragraph could be deleted without loss,
  delete it.
- Prefer a number to an adjective. "Dilution of 20% a year halves your claim in
  three years" beats "significant dilution".
- One idea per section, with a heading that states the idea rather than naming
  the topic.
- Use a blockquote for the sentence you want remembered, not for decoration.
- End on the consequence for the reader, not a summary of what was said.
- 600–1200 words is the range that reads well in this layout. Longer needs
  sections; much shorter reads as a note rather than a post.

Do not invent figures. Anything presented as a fact needs a source the user can
check — and if a number could not be verified, say so in the post rather than
rounding it into confidence.

## Categories

Reuse an existing name rather than inventing a near-duplicate; check what is
already in use at `https://stock.369usa.com/blog.php`, where every category with
at least one post appears as a filter chip. Categories are created on first use,
so a typo becomes a permanent near-empty category.

## After publishing

1. Fetch the returned `url` and confirm it renders — a 200 and the title on the
   page, not just the endpoint's 201.
2. Give the user the link.
3. If anything looks wrong, fix the markdown and re-send with the same slug.

## Guardrails

- Never publish without the user having seen the draft.
- Never print the publishing key, and never commit it.
- The endpoint is public: a 401 means the key is wrong, not that the post is bad.
- Report a failed publish with the endpoint's own message. Do not describe a post
  as live without having fetched it.

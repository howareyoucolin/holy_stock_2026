<?php

declare(strict_types=1);

/*
 * A small markdown renderer for blog posts.
 *
 * Deliberately not a full markdown implementation and deliberately not an HTML
 * sanitiser. Posts arrive over the network from an agent, so the safe direction
 * is to escape everything first and then re-introduce a fixed set of marks —
 * there is no path by which author text becomes live markup, because the only
 * tags emitted are the ones this file writes itself.
 *
 * Supported: headings, paragraphs, bullet and numbered lists, blockquotes,
 * fenced code, horizontal rules, and inline bold / italic / code / links.
 */

/** Links are limited to schemes that cannot execute; everything else is dropped. */
function md_safe_url(string $url): ?string
{
    $url = trim($url);

    if ($url === '') {
        return null;
    }

    if (str_starts_with($url, '/') || str_starts_with($url, '#')) {
        return $url;
    }

    $scheme = strtolower((string) parse_url($url, PHP_URL_SCHEME));

    return in_array($scheme, ['http', 'https', 'mailto'], true) ? $url : null;
}

/** Inline marks, applied to already-escaped text. */
function md_inline(string $escaped): string
{
    // Code first: whatever is inside it must not then be read as bold or a link.
    $escaped = preg_replace_callback(
        '/`([^`]+)`/',
        static fn (array $m): string => '<code>' . $m[1] . '</code>',
        $escaped,
    ) ?? $escaped;

    $escaped = preg_replace_callback(
        '/\[([^\]]+)\]\(([^)\s]+)\)/',
        static function (array $m): string {
            // The href was escaped with the rest of the line, so unescape before
            // validating the scheme, then re-escape for the attribute.
            $url = md_safe_url(html_entity_decode($m[2], ENT_QUOTES, 'UTF-8'));

            if ($url === null) {
                return $m[1];
            }

            $external = str_starts_with($url, 'http');

            return '<a href="' . htmlspecialchars($url, ENT_QUOTES) . '"'
                . ($external ? ' rel="noopener nofollow" target="_blank"' : '')
                . '>' . $m[1] . '</a>';
        },
        $escaped,
    ) ?? $escaped;

    $escaped = preg_replace('/\*\*([^*]+)\*\*/', '<strong>$1</strong>', $escaped) ?? $escaped;

    return preg_replace('/(?<![\w*])\*([^*\n]+)\*(?![\w*])/', '<em>$1</em>', $escaped) ?? $escaped;
}

/** Renders markdown to the subset of HTML this site styles. */
function md_render(string $markdown): string
{
    $lines = explode("\n", str_replace("\r\n", "\n", $markdown));
    $html = '';
    $paragraph = [];
    $listType = null;
    $quote = [];
    $fence = null;

    $flushParagraph = static function () use (&$paragraph, &$html): void {
        if ($paragraph !== []) {
            $html .= '<p>' . md_inline(htmlspecialchars(implode(' ', $paragraph), ENT_QUOTES)) . "</p>\n";
            $paragraph = [];
        }
    };

    $flushList = static function () use (&$listType, &$html): void {
        if ($listType !== null) {
            $html .= "</{$listType}>\n";
            $listType = null;
        }
    };

    $flushQuote = static function () use (&$quote, &$html): void {
        if ($quote !== []) {
            $html .= '<blockquote><p>'
                . md_inline(htmlspecialchars(implode(' ', $quote), ENT_QUOTES))
                . "</p></blockquote>\n";
            $quote = [];
        }
    };

    foreach ($lines as $rawLine) {
        $line = rtrim($rawLine);
        $trimmed = trim($line);

        // Inside a fence, everything is literal until the closing fence.
        if ($fence !== null) {
            if (preg_match('/^```/', $trimmed) === 1) {
                $html .= '<pre class="code"><code>' . htmlspecialchars(implode("\n", $fence), ENT_QUOTES)
                    . "</code></pre>\n";
                $fence = null;
                continue;
            }

            $fence[] = $rawLine;
            continue;
        }

        if (preg_match('/^```/', $trimmed) === 1) {
            $flushParagraph();
            $flushList();
            $flushQuote();
            $fence = [];
            continue;
        }

        if ($trimmed === '') {
            $flushParagraph();
            $flushList();
            $flushQuote();
            continue;
        }

        if (preg_match('/^(-{3,}|\*{3,}|_{3,})$/', $trimmed) === 1) {
            $flushParagraph();
            $flushList();
            $flushQuote();
            $html .= "<hr>\n";
            continue;
        }

        if (preg_match('/^(#{1,4})\s+(.*)$/', $trimmed, $m) === 1) {
            $flushParagraph();
            $flushList();
            $flushQuote();
            // The post title is the page's h1, and by convention a post's own
            // top-level sections are written `##`. Mapping both `#` and `##` to
            // h2 keeps the document from starting at h3 and leaving a hole in
            // the heading order.
            $level = max(2, min(4, strlen($m[1])));
            $html .= "<h{$level}>" . md_inline(htmlspecialchars(trim($m[2]), ENT_QUOTES)) . "</h{$level}>\n";
            continue;
        }

        if (preg_match('/^>\s?(.*)$/', $trimmed, $m) === 1) {
            $flushParagraph();
            $flushList();
            $quote[] = trim($m[1]);
            continue;
        }

        $bullet = preg_match('/^[-*+]\s+(.*)$/', $trimmed, $m) === 1;
        $numbered = !$bullet && preg_match('/^\d+[.)]\s+(.*)$/', $trimmed, $m) === 1;

        if ($bullet || $numbered) {
            $flushParagraph();
            $flushQuote();
            $wanted = $bullet ? 'ul' : 'ol';

            if ($listType !== $wanted) {
                $flushList();
                $html .= "<{$wanted} class=\"prose-list\">\n";
                $listType = $wanted;
            }

            $html .= '<li>' . md_inline(htmlspecialchars(trim($m[1]), ENT_QUOTES)) . "</li>\n";
            continue;
        }

        $flushList();
        $flushQuote();
        $paragraph[] = $trimmed;
    }

    // An unterminated fence still renders, rather than swallowing the tail.
    if ($fence !== null) {
        $html .= '<pre class="code"><code>' . htmlspecialchars(implode("\n", $fence), ENT_QUOTES)
            . "</code></pre>\n";
    }

    $flushParagraph();
    $flushList();
    $flushQuote();

    return $html;
}

/** A plain-text opening for list pages and meta descriptions. */
function md_summarise(string $markdown, int $limit = 200): string
{
    $text = preg_replace('/```.*?```/s', ' ', $markdown) ?? $markdown;
    $text = preg_replace('/^[#>\-*+\d.\s]+/m', '', $text) ?? $text;
    $text = preg_replace('/\[([^\]]+)\]\([^)]*\)/', '$1', $text) ?? $text;
    $text = trim(preg_replace('/[`*_]|\s+/', ' ', $text) ?? $text);

    if (mb_strlen($text) <= $limit) {
        return $text;
    }

    $cut = mb_substr($text, 0, $limit);
    $lastSpace = mb_strrpos($cut, ' ');

    return ($lastSpace !== false ? mb_substr($cut, 0, $lastSpace) : $cut) . '…';
}

/** URL-safe slug from a title. */
function md_slugify(string $text, int $limit = 80): string
{
    $slug = strtolower(trim($text));
    $slug = preg_replace('/[^a-z0-9]+/u', '-', $slug) ?? $slug;
    $slug = trim($slug, '-');

    if ($slug === '') {
        $slug = 'post';
    }

    return mb_substr($slug, 0, $limit);
}

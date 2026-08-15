<?php

declare(strict_types=1);

/*
 * Renders a stored analysis. The text was written to the shape buildFinalPrompt()
 * asks for — a TL;DR line, then all-caps sections of bullets — so this is the PHP
 * counterpart of parseFinal() in app/src/components/FinalAnswer.jsx.
 *
 * Everything here escapes before it emits: the text is model output, and it is
 * shown on a public page.
 */

/** Sections whose bullets read as warnings rather than findings. */
const WARN_SECTIONS = ['RISKS', 'CAVEATS', 'WORTH KNOWING', 'GOTCHAS', 'WHERE THEY DISAGREED'];

/**
 * Escapes, then re-applies the only two inline marks the agents tend to emit.
 * Order matters: escaping first means a model writing <script> stays inert.
 */
function inline_markup(string $text): string
{
    $escaped = htmlspecialchars($text, ENT_QUOTES);

    $escaped = preg_replace('/\*\*([^*]+)\*\*/', '<strong>$1</strong>', $escaped) ?? $escaped;

    return preg_replace('/`([^`]+)`/', '<code>$1</code>', $escaped) ?? $escaped;
}

/**
 * Splits an analysis into its TL;DR and titled sections. Returns null when the
 * text does not match the shape, so the caller can show it verbatim rather than
 * mangle it.
 *
 * @return array{tldr: string, sections: list<array{title: string, items: list<string>}>}|null
 */
function parse_analysis(string $text): ?array
{
    $tldr = '';
    $sections = [];
    // An index, deliberately not a reference: `$sections[] = &$current` makes
    // every element alias the same value, so each new heading overwrites the
    // last and the whole document ends up under one title.
    $currentIndex = -1;
    $inTldr = false;

    foreach (explode("\n", $text) as $rawLine) {
        $line = trim($rawLine);

        if ($line === '') {
            continue;
        }

        if (preg_match('/^\**\s*TL;?DR\s*:?\**\s*(.*)$/i', $line, $m) === 1) {
            $tldr = trim(trim($m[1], '*'));
            $inTldr = true;
            continue;
        }

        $isBullet = preg_match('/^[-*•]\s+(.*)$/u', $line, $bullet) === 1;

        // A heading is a markdown heading or a short all-caps line. Bullets are
        // tested first, so an all-caps bullet is never mistaken for one.
        $isHeading = false;
        $headingText = '';

        if (!$isBullet && preg_match('/^(?:#{1,4}\s*)?\**([^*]{2,44})\**:?$/u', $line, $h) === 1) {
            $headingText = rtrim(trim($h[1]), ':');
            $isHeading = str_starts_with($line, '#')
                || $headingText === mb_strtoupper($headingText) && preg_match('/[A-Z]/', $headingText) === 1;
        }

        if ($isHeading) {
            $sections[] = ['title' => $headingText, 'items' => []];
            $currentIndex = count($sections) - 1;
            $inTldr = false;
            continue;
        }

        if ($isBullet) {
            $item = trim($bullet[1]);
        } elseif ($inTldr && $tldr !== '') {
            // A TL;DR that wrapped onto the next line.
            $tldr .= ' ' . $line;
            continue;
        } else {
            $item = $line;
        }

        if ($currentIndex === -1) {
            $sections[] = ['title' => '', 'items' => []];
            $currentIndex = count($sections) - 1;
        }

        $sections[$currentIndex]['items'][] = $item;
        $inTldr = false;
    }

    $withItems = array_values(array_filter($sections, static fn (array $s): bool => $s['items'] !== []));

    if ($tldr === '' && $withItems === []) {
        return null;
    }

    return ['tldr' => $tldr, 'sections' => $withItems];
}

/** The TL;DR alone, for the list page. Falls back to the opening text. */
function analysis_excerpt(string $text, int $limit = 240): string
{
    $parsed = parse_analysis($text);
    $source = $parsed['tldr'] ?? '';

    if ($source === '') {
        $source = trim(preg_replace('/\s+/', ' ', $text) ?? '');
    }

    if (mb_strlen($source) <= $limit) {
        return $source;
    }

    $cut = mb_substr($source, 0, $limit);
    $lastSpace = mb_strrpos($cut, ' ');

    return ($lastSpace !== false ? mb_substr($cut, 0, $lastSpace) : $cut) . '…';
}

/**
 * The buy/hold/sell call, read from the `Call:` line the synthesis format asks
 * for, or from the TL;DR opening as a fallback. Null when neither says.
 */
function analysis_call(string $text): ?string
{
    if (preg_match('/\bCall\s*:\s*\**\s*(buy|hold|sell)/i', $text, $m) === 1) {
        return strtolower($m[1]);
    }

    $parsed = parse_analysis($text);
    $tldr = $parsed['tldr'] ?? '';

    if ($tldr !== '' && preg_match('/\b(buy|hold|sell)\b/i', $tldr, $m) === 1) {
        return strtolower($m[1]);
    }

    return null;
}

/** Renders the parsed body, or the raw text when it did not parse. */
function render_analysis(string $text): string
{
    $parsed = parse_analysis($text);

    if ($parsed === null) {
        return '<pre class="verbatim">' . htmlspecialchars($text, ENT_QUOTES) . '</pre>';
    }

    $html = '';

    if ($parsed['tldr'] !== '') {
        $html .= '<p class="tldr">' . inline_markup($parsed['tldr']) . "</p>\n";
    }

    foreach ($parsed['sections'] as $section) {
        $warn = in_array(mb_strtoupper($section['title']), WARN_SECTIONS, true);

        $html .= '<section class="section">';

        if ($section['title'] !== '') {
            $html .= '<h2>' . htmlspecialchars($section['title'], ENT_QUOTES) . '</h2>';
        }

        $html .= '<ul class="points' . ($warn ? ' points-warn' : '') . '">';

        foreach ($section['items'] as $item) {
            $html .= '<li>' . inline_markup($item) . '</li>';
        }

        $html .= "</ul></section>\n";
    }

    return $html;
}

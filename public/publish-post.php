<?php

declare(strict_types=1);

/*
 * The only way a blog post reaches the database. There is no admin UI: an agent
 * writes the post and sends it here with the key from .secrets, and the name on
 * the matching `secrets` row is recorded as the author.
 *
 * Re-sending a post with the same slug updates it in place, so an agent can fix
 * a typo without creating a second copy. Categories are created on first use.
 *
 * Reachable from the public internet, so it says as little as possible on
 * failure and never echoes database detail.
 */

require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/parts/markdown.php';

header('Content-Type: application/json; charset=utf-8');

const MAX_TITLE = 200;
const MAX_SUMMARY = 400;
const MAX_BODY = 120000;
const MAX_CATEGORIES = 6;
const MAX_CATEGORY_NAME = 80;

function fail(int $status, string $message): never
{
    http_response_code($status);
    echo json_encode(['error' => $message]), "\n";
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    header('Allow: POST');
    fail(405, 'Use POST.');
}

$body = json_decode((string) file_get_contents('php://input'), true);

if (!is_array($body)) {
    fail(400, 'Expected a JSON body.');
}

$secret = trim((string) ($body['secret'] ?? ''));
$title = trim((string) ($body['title'] ?? ''));
$markdown = trim((string) ($body['body'] ?? ''));
$summary = trim((string) ($body['summary'] ?? ''));
$slug = md_slugify((string) ($body['slug'] ?? '') !== '' ? (string) $body['slug'] : $title);
$categories = is_array($body['categories'] ?? null) ? $body['categories'] : [];

if ($secret === '') {
    fail(401, 'A publishing key is required.');
}

if ($title === '' || mb_strlen($title) > MAX_TITLE) {
    fail(400, 'A title is required, up to ' . MAX_TITLE . ' characters.');
}

if ($markdown === '') {
    fail(400, 'The post body is required.');
}

if (mb_strlen($markdown) > MAX_BODY) {
    fail(400, 'That post is too long.');
}

if (count($categories) > MAX_CATEGORIES) {
    fail(400, 'At most ' . MAX_CATEGORIES . ' categories.');
}

// Written from the body when the caller does not supply one, so a list page
// always has something to show.
if ($summary === '') {
    $summary = md_summarise($markdown, 200);
}

$summary = mb_substr($summary, 0, MAX_SUMMARY);

$clean = [];

foreach ($categories as $raw) {
    $name = trim((string) $raw);

    if ($name === '') {
        continue;
    }

    if (mb_strlen($name) > MAX_CATEGORY_NAME) {
        fail(400, 'A category name is too long.');
    }

    $clean[md_slugify($name)] = $name;
}

try {
    $pdo = connect_pdo();

    $stmt = $pdo->prepare('SELECT id, name FROM secrets WHERE md5_hashed_secret_key = :hash LIMIT 1');
    $stmt->execute(['hash' => md5($secret)]);
    $publisher = $stmt->fetch();

    if ($publisher === false) {
        fail(401, 'That publishing key was not recognised.');
    }

    // One transaction: a post with half its categories attached would be worse
    // than a failed publish.
    $pdo->beginTransaction();

    $existing = $pdo->prepare('SELECT id FROM posts WHERE slug = :slug LIMIT 1');
    $existing->execute(['slug' => $slug]);
    $found = $existing->fetch();

    if ($found !== false) {
        $postId = (int) $found['id'];

        $pdo->prepare(
            <<<'SQL'
UPDATE posts
   SET title = :title, summary = :summary, body = :body,
       published_by = :published_by, updated_at = NOW()
 WHERE id = :id
SQL
        )->execute([
            'title' => $title,
            'summary' => $summary,
            'body' => $markdown,
            'published_by' => $publisher['name'],
            'id' => $postId,
        ]);

        $pdo->prepare('DELETE FROM post_categories WHERE post_id = :id')->execute(['id' => $postId]);
        $created = false;
    } else {
        $pdo->prepare(
            <<<'SQL'
INSERT INTO posts (slug, title, summary, body, published_by, created_at)
VALUES (:slug, :title, :summary, :body, :published_by, NOW())
SQL
        )->execute([
            'slug' => $slug,
            'title' => $title,
            'summary' => $summary,
            'body' => $markdown,
            'published_by' => $publisher['name'],
        ]);

        $postId = (int) $pdo->lastInsertId();
        $created = true;
    }

    $findCategory = $pdo->prepare('SELECT id FROM categories WHERE slug = :slug LIMIT 1');
    $addCategory = $pdo->prepare(
        'INSERT INTO categories (slug, name, created_at) VALUES (:slug, :name, NOW())'
    );
    $link = $pdo->prepare(
        'INSERT INTO post_categories (post_id, category_id) VALUES (:post_id, :category_id)'
    );

    foreach ($clean as $categorySlug => $categoryName) {
        $findCategory->execute(['slug' => $categorySlug]);
        $category = $findCategory->fetch();

        if ($category === false) {
            $addCategory->execute(['slug' => $categorySlug, 'name' => $categoryName]);
            $categoryId = (int) $pdo->lastInsertId();
        } else {
            $categoryId = (int) $category['id'];
        }

        $link->execute(['post_id' => $postId, 'category_id' => $categoryId]);
    }

    $pdo->commit();

    http_response_code($created ? 201 : 200);
    echo json_encode([
        'id' => $postId,
        'slug' => $slug,
        'created' => $created,
        'categories' => array_values($clean),
        'url' => '/post.php?slug=' . rawurlencode($slug),
        'published_by' => $publisher['name'],
    ]), "\n";
} catch (Throwable $e) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }

    error_log('publish-post.php failed: ' . $e->getMessage());
    fail(500, 'Could not save the post.');
}

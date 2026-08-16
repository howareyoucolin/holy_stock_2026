<?php

declare(strict_types=1);

// One blog post, rendered from the markdown it was published as.

require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/parts/markdown.php';

$slug = md_slugify((string) filter_input(INPUT_GET, 'slug'));
$requested = trim((string) filter_input(INPUT_GET, 'slug'));

$post = null;
$categories = [];
$dbError = null;

if ($requested !== '') {
    try {
        $pdo = connect_pdo();

        $stmt = $pdo->prepare(
            <<<'SQL'
SELECT id, slug, title, summary, body, published_by, created_at, updated_at
FROM posts
WHERE slug = :slug
LIMIT 1
SQL
        );
        $stmt->execute(['slug' => $slug]);
        $found = $stmt->fetch();
        $post = $found === false ? null : $found;

        if ($post !== null) {
            $tags = $pdo->prepare(
                <<<'SQL'
SELECT c.slug, c.name
FROM post_categories pc
JOIN categories c ON c.id = pc.category_id
WHERE pc.post_id = :id
ORDER BY c.name
SQL
            );
            $tags->execute(['id' => (int) $post['id']]);
            $categories = $tags->fetchAll();
        }
    } catch (Throwable $e) {
        error_log('post.php failed: ' . $e->getMessage());
        $dbError = 'That post could not be loaded just now.';
    }
}

if ($dbError === null && $post === null) {
    http_response_code(404);
}

$pageTitle = $post === null ? 'HolyStocks' : $post['title'] . ' — HolyStocks';

require __DIR__ . '/parts/header.php';
?>

<a class="back" href="/blog.php">&larr; All posts</a>

<?php if ($dbError !== null): ?>
    <p class="banner"><?= htmlspecialchars($dbError, ENT_QUOTES) ?></p>
<?php elseif ($post === null): ?>
    <p class="empty">That post does not exist.</p>
<?php else: ?>
    <article class="prose">
        <h1 class="page-title"><?= htmlspecialchars((string) $post['title'], ENT_QUOTES) ?></h1>

        <p class="meta">
            <?= htmlspecialchars(date('j F Y', strtotime((string) $post['created_at'])), ENT_QUOTES) ?>
            &middot; by <?= htmlspecialchars((string) $post['published_by'], ENT_QUOTES) ?>
            <?php if (($post['updated_at'] ?? null) !== null): ?>
                &middot; updated <?= htmlspecialchars(date('j F Y', strtotime((string) $post['updated_at'])), ENT_QUOTES) ?>
            <?php endif; ?>
        </p>

        <?php if ($categories !== []): ?>
            <div class="card-tags">
                <?php foreach ($categories as $category): ?>
                    <a class="badge badge-risk" href="/blog.php?category=<?= rawurlencode((string) $category['slug']) ?>">
                        <?= htmlspecialchars((string) $category['name'], ENT_QUOTES) ?>
                    </a>
                <?php endforeach; ?>
            </div>
        <?php endif; ?>

        <?= md_render((string) $post['body']) ?>
    </article>
<?php endif; ?>

<?php require __DIR__ . '/parts/footer.php'; ?>

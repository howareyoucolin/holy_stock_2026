<?php

declare(strict_types=1);

// Public, read-only list of blog posts, newest first, optionally filtered to one
// category. Posts arrive through publish-post.php; nothing here writes.

require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/parts/markdown.php';

const PER_PAGE = 20;

$page = filter_input(INPUT_GET, 'page', FILTER_VALIDATE_INT);
$page = is_int($page) && $page > 0 ? $page : 1;

$categorySlug = md_slugify((string) filter_input(INPUT_GET, 'category'));
$filtering = $categorySlug !== 'post' && (string) filter_input(INPUT_GET, 'category') !== '';

$posts = [];
$categories = [];
$activeCategory = null;
$total = 0;
$totalPages = 1;
$dbError = null;

try {
    $pdo = connect_pdo();

    // Every category that has at least one post, with its count, for the filter row.
    $categories = $pdo->query(
        <<<'SQL'
SELECT c.slug, c.name, COUNT(pc.post_id) AS post_count
FROM categories c
JOIN post_categories pc ON pc.category_id = c.id
GROUP BY c.id, c.slug, c.name
ORDER BY c.name
SQL
    )->fetchAll();

    if ($filtering) {
        $lookup = $pdo->prepare('SELECT id, name FROM categories WHERE slug = :slug LIMIT 1');
        $lookup->execute(['slug' => $categorySlug]);
        $found = $lookup->fetch();
        $activeCategory = $found === false ? null : $found;
    }

    if ($filtering && $activeCategory === null) {
        // Unknown category: an empty list is the honest answer.
        $total = 0;
    } elseif ($activeCategory !== null) {
        $count = $pdo->prepare(
            'SELECT COUNT(*) FROM post_categories WHERE category_id = :id'
        );
        $count->execute(['id' => $activeCategory['id']]);
        $total = (int) $count->fetchColumn();
    } else {
        $total = (int) $pdo->query('SELECT COUNT(*) FROM posts')->fetchColumn();
    }

    $totalPages = max(1, (int) ceil($total / PER_PAGE));
    $page = min($page, $totalPages);
    $offset = ($page - 1) * PER_PAGE;

    if ($total > 0) {
        $sql = $activeCategory !== null
            ? <<<'SQL'
SELECT p.id, p.slug, p.title, p.summary, p.published_by, p.created_at
FROM posts p
JOIN post_categories pc ON pc.post_id = p.id
WHERE pc.category_id = :category_id
ORDER BY p.created_at DESC, p.id DESC
LIMIT :limit OFFSET :offset
SQL
            : <<<'SQL'
SELECT p.id, p.slug, p.title, p.summary, p.published_by, p.created_at
FROM posts p
ORDER BY p.created_at DESC, p.id DESC
LIMIT :limit OFFSET :offset
SQL;

        $stmt = $pdo->prepare($sql);

        if ($activeCategory !== null) {
            $stmt->bindValue(':category_id', (int) $activeCategory['id'], PDO::PARAM_INT);
        }

        $stmt->bindValue(':limit', PER_PAGE, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        $posts = $stmt->fetchAll();

        // Categories per post, in one query rather than one per row.
        if ($posts !== []) {
            $ids = array_map(static fn (array $p): int => (int) $p['id'], $posts);
            $in = implode(',', array_fill(0, count($ids), '?'));

            $tagStmt = $pdo->prepare(
                "SELECT pc.post_id, c.slug, c.name
                 FROM post_categories pc
                 JOIN categories c ON c.id = pc.category_id
                 WHERE pc.post_id IN ($in)
                 ORDER BY c.name"
            );
            $tagStmt->execute($ids);

            $tags = [];
            foreach ($tagStmt->fetchAll() as $row) {
                $tags[(int) $row['post_id']][] = $row;
            }

            foreach ($posts as $index => $post) {
                $posts[$index]['categories'] = $tags[(int) $post['id']] ?? [];
            }
        }
    }
} catch (Throwable $e) {
    error_log('blog.php failed: ' . $e->getMessage());
    $dbError = 'The blog could not be loaded just now.';
}

$pageTitle = $activeCategory !== null
    ? $activeCategory['name'] . ' — HolyStocks'
    : 'Blog — HolyStocks';

require __DIR__ . '/parts/header.php';
?>

<h1 class="page-title">Blog</h1>

<?php if ($dbError !== null): ?>
    <p class="banner"><?= htmlspecialchars($dbError, ENT_QUOTES) ?></p>
<?php else: ?>
    <?php if ($categories !== []): ?>
        <nav class="chips" aria-label="Categories">
            <a class="chip<?= $activeCategory === null ? ' chip-on' : '' ?>" href="/blog.php">All</a>
            <?php foreach ($categories as $category): ?>
                <a
                    class="chip<?= $activeCategory !== null && $activeCategory['name'] === $category['name'] ? ' chip-on' : '' ?>"
                    href="/blog.php?category=<?= rawurlencode((string) $category['slug']) ?>"
                >
                    <?= htmlspecialchars((string) $category['name'], ENT_QUOTES) ?>
                    <span class="chip-count"><?= (int) $category['post_count'] ?></span>
                </a>
            <?php endforeach; ?>
        </nav>
    <?php endif; ?>

    <?php if ($posts === []): ?>
        <p class="empty">
            <?= $filtering ? 'Nothing in that category yet.' : 'No posts yet.' ?>
        </p>
    <?php else: ?>
        <div class="stack">
            <?php foreach ($posts as $post): ?>
                <a class="card" href="/post.php?slug=<?= rawurlencode((string) $post['slug']) ?>">
                    <div class="card-head">
                        <h2 class="post-title"><?= htmlspecialchars((string) $post['title'], ENT_QUOTES) ?></h2>
                        <span class="card-date">
                            <?= htmlspecialchars(date('j M Y', strtotime((string) $post['created_at'])), ENT_QUOTES) ?>
                        </span>
                    </div>

                    <?php if (($post['categories'] ?? []) !== []): ?>
                        <div class="card-tags">
                            <?php foreach ($post['categories'] as $category): ?>
                                <span class="badge badge-risk"><?= htmlspecialchars((string) $category['name'], ENT_QUOTES) ?></span>
                            <?php endforeach; ?>
                        </div>
                    <?php endif; ?>

                    <p class="excerpt"><?= htmlspecialchars((string) $post['summary'], ENT_QUOTES) ?></p>
                </a>
            <?php endforeach; ?>
        </div>

        <?php if ($totalPages > 1): ?>
            <?php $base = $activeCategory !== null
                ? '/blog.php?category=' . rawurlencode($categorySlug) . '&amp;page='
                : '/blog.php?page='; ?>
            <nav class="pager">
                <?php if ($page > 1): ?>
                    <a href="<?= $base . ($page - 1) ?>" rel="prev">&larr; Newer</a>
                <?php endif; ?>
                <?php if ($page < $totalPages): ?>
                    <a href="<?= $base . ($page + 1) ?>" rel="next">Older &rarr;</a>
                <?php endif; ?>
                <span class="page-of">Page <?= $page ?> of <?= $totalPages ?></span>
            </nav>
        <?php endif; ?>
    <?php endif; ?>
<?php endif; ?>

<?php require __DIR__ . '/parts/footer.php'; ?>

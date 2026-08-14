<?php

declare(strict_types=1);

// Asks the local `claude` and `codex` CLIs a question and shows both answers.
//
// PHP cannot run those CLIs itself: this page executes inside the Linux php
// container, while both CLIs are installed and authenticated on the macOS host
// (Claude Code keeps its credentials in the macOS Keychain, and codex ships a
// darwin binary). So this page only queues a job into the bind-mounted
// storage/ai-jobs/ directory; bin/ai-runner.sh runs on the host, picks the job
// up, and writes the answers back. Start the runner in a terminal first:
//
//     ./bin/ai-runner.sh
//
// Because a job here causes AI agents to execute on the host machine, the
// feature stays off unless AI_ASK_ENABLED=1 is present in the environment. That
// variable is set in .env for local Docker and is absent in production, so the
// page is inert if it ever gets deployed.

$pageTitle = 'holyStocks';

const AGENTS = ['claude' => 'Claude', 'codex' => 'Codex'];
const MAX_QUESTION_LENGTH = 4000;

$jobsDir = dirname(__DIR__) . '/storage/ai-jobs';
$enabled = (getenv('AI_ASK_ENABLED') ?: '') === '1';

$errors = [];
$job = null;
$question = '';

// Job IDs go into a filesystem path, so accept only the exact shape we generate.
function ask_valid_job_id(string $id): bool
{
    return preg_match('/^[a-f0-9]{16}$/', $id) === 1;
}

// Read one agent's state for a job: status plus answer text when finished.
function ask_read_agent(string $jobDir, string $agent): array
{
    $statusFile = "{$jobDir}/{$agent}.status";
    $outFile = "{$jobDir}/{$agent}.out";

    $status = is_file($statusFile) ? trim((string) file_get_contents($statusFile)) : 'queued';
    $answer = is_file($outFile) ? (string) file_get_contents($outFile) : '';

    return ['status' => $status, 'answer' => $answer];
}

if ($enabled && ($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    $question = trim((string) ($_POST['question'] ?? ''));

    if ($question === '') {
        $errors[] = 'Enter a question first.';
    } elseif (mb_strlen($question) > MAX_QUESTION_LENGTH) {
        $errors[] = 'Question is too long (max ' . MAX_QUESTION_LENGTH . ' characters).';
    }

    if ($errors === []) {
        $jobId = bin2hex(random_bytes(8));
        $jobDir = "{$jobsDir}/{$jobId}";

        if (!@mkdir($jobDir, 0775, true) && !is_dir($jobDir)) {
            $errors[] = 'Could not create the job directory. Is storage/ai-jobs writable?';
        } else {
            // Write the question first, then the .ready marker, so the runner never
            // sees a job whose question file is still incomplete.
            file_put_contents("{$jobDir}/question.txt", $question);
            file_put_contents("{$jobDir}/.ready", '');

            header('Location: ask.php?job=' . $jobId);
            exit;
        }
    }
}

$jobId = (string) ($_GET['job'] ?? '');

if ($jobId !== '') {
    if (!ask_valid_job_id($jobId) || !is_dir("{$jobsDir}/{$jobId}")) {
        $errors[] = 'That job could not be found.';
    } else {
        $jobDir = "{$jobsDir}/{$jobId}";
        $job = [
            'id' => $jobId,
            'question' => is_file("{$jobDir}/question.txt")
                ? (string) file_get_contents("{$jobDir}/question.txt")
                : '',
            'agents' => [],
            'claimed' => is_dir("{$jobDir}/.claimed"),
        ];

        foreach (AGENTS as $agent => $label) {
            $job['agents'][$agent] = ask_read_agent($jobDir, $agent);
        }
    }
}

// Auto-refresh only while something is still running.
$pending = false;
if ($job !== null) {
    foreach ($job['agents'] as $agent) {
        if (in_array($agent['status'], ['queued', 'running'], true)) {
            $pending = true;
        }
    }
}

require __DIR__ . '/parts/header.php';
?>

<?php if ($pending): ?>
    <meta http-equiv="refresh" content="3">
<?php endif; ?>

<h2>Ask AI Agents</h2>

<p>
    Put a question to two AI coding agents at once &mdash; <strong>Claude</strong>
    and <strong>Codex</strong> &mdash; and compare what each one says. Both run as
    the CLIs already installed on this Mac, so no API keys are needed here.
</p>

<?php if (!$enabled): ?>
    <p class="fail">
        This feature is disabled. Set <code>AI_ASK_ENABLED=1</code> in <code>.env</code>
        and run <code>docker compose up -d --force-recreate</code>.
    </p>
<?php else: ?>
    <p class="muted">
        Answers take up to a couple of minutes. The host-side runner must be going
        in a terminal: <code>./bin/ai-runner.sh</code>
    </p>
<?php endif; ?>

<?php foreach ($errors as $error): ?>
    <p class="fail"><?= htmlspecialchars($error, ENT_QUOTES) ?></p>
<?php endforeach; ?>

<form method="post" action="ask.php">
    <textarea
        name="question"
        rows="6"
        placeholder="e.g. What is the difference between a PHP trait and an abstract class?"
        maxlength="<?= MAX_QUESTION_LENGTH ?>"
        <?= $enabled ? '' : 'disabled' ?>
    ><?= htmlspecialchars($question, ENT_QUOTES) ?></textarea>
    <button type="submit" <?= $enabled ? '' : 'disabled' ?>>Ask AI Agents</button>
</form>

<?php if ($job !== null): ?>
    <hr>

    <h3>Question</h3>
    <blockquote><?= nl2br(htmlspecialchars($job['question'], ENT_QUOTES)) ?></blockquote>

    <?php foreach (AGENTS as $agent => $label): ?>
        <?php $state = $job['agents'][$agent]; ?>
        <h3>
            <?= htmlspecialchars($label, ENT_QUOTES) ?>
            <?php if ($state['status'] === 'done'): ?>
                <span class="ok">&#10003;</span>
            <?php elseif ($state['status'] === 'error'): ?>
                <span class="fail">failed</span>
            <?php else: ?>
                <span class="muted"><?= htmlspecialchars($state['status'], ENT_QUOTES) ?>&hellip;</span>
            <?php endif; ?>
        </h3>

        <?php if ($state['answer'] !== ''): ?>
            <pre class="answer"><?= htmlspecialchars($state['answer'], ENT_QUOTES) ?></pre>
        <?php elseif ($state['status'] === 'queued' && !$job['claimed']): ?>
            <p class="muted">Waiting for the host runner to pick this up.</p>
        <?php else: ?>
            <p class="muted">No output yet.</p>
        <?php endif; ?>
    <?php endforeach; ?>

    <?php if ($pending): ?>
        <p class="muted">This page refreshes every 3 seconds until both agents finish.</p>
    <?php endif; ?>
<?php endif; ?>

<?php require __DIR__ . '/parts/footer.php'; ?>

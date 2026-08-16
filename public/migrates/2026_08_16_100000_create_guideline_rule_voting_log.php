<?php

declare(strict_types=1);

// Every round of voting on a proposed guideline rule, kept whether the rule was
// approved or not.
//
// This is a log, so a rule name appears once per round rather than once: the
// point is that refining a rule and voting again can show the agents what they
// said last time, and what changed their minds. `(name, created_at)` is indexed
// for exactly that lookup.
//
// `voting_result` holds one entry per agent — its vote, its reasoning lines and
// its confidence — as JSON rather than as columns, because the roster is not
// fixed and a vote is only ever read back whole.

return [
    'name' => '2026_08_16_100000_create_guideline_rule_voting_log',
    'up' => <<<'SQL'
CREATE TABLE guideline_rule_voting_log (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(120) NOT NULL,
    description TEXT NOT NULL,
    voting_result JSON NOT NULL,
    avg_confidence_level DECIMAL(3,1) NOT NULL,
    created_at DATETIME NOT NULL,
    PRIMARY KEY (id),
    KEY idx_rule_history (name, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
SQL,
];

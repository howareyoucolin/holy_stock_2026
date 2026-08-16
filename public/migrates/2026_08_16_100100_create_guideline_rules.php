<?php

declare(strict_types=1);

// The rules that actually apply — the ones a vote approved. These are what get
// handed to the agents as soft guidelines alongside whatever they find on the
// web, so this table stays small and deliberate.
//
// `name` is unique here, unlike in the voting log: the log records every round,
// while this holds the one version of a rule currently in force. Re-approving a
// refined rule replaces it rather than accumulating near-duplicates that would
// each be injected into every future prompt.
//
// `voting_result` and `avg_confidence_level` are copied from the round that
// approved it, so a rule carries its own provenance without a join.

return [
    'name' => '2026_08_16_100100_create_guideline_rules',
    'up' => <<<'SQL'
CREATE TABLE guideline_rules (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(120) NOT NULL,
    description TEXT NOT NULL,
    voting_result JSON NOT NULL,
    avg_confidence_level DECIMAL(3,1) NOT NULL,
    approved_at DATETIME NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uniq_rule_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
SQL,
];

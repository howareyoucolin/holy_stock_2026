import { NextResponse } from 'next/server'
import { approveRule, describeDbError, saveVotingRound, votingRound } from '@/lib/db'
import { parseVote } from '@/lib/prompts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/*
 * Records one round of voting on a guideline rule.
 *
 * The ballots are parsed here from the agents' own replies rather than trusted
 * from the client: the vote, confidence and reasoning that reach the database
 * are the ones the agents actually wrote. A reply that carries no recognisable
 * vote is kept in the round as `unparsed` instead of being dropped, so a round
 * of four agents never quietly becomes a round of three.
 *
 * Recording a round says nothing about whether the rule is in force. Promoting
 * it into `guideline_rules` — the set handed to agents as standing guidance — is
 * a separate PUT, because a passing vote is a recommendation and adopting it is
 * a decision.
 */
export async function POST(request) {
  let body

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 })
  }

  const name = String(body?.ruleName ?? '').trim()
  const description = String(body?.ruleDescription ?? '').trim()
  const answers = Array.isArray(body?.answers) ? body.answers : []
  const reviews = Array.isArray(body?.reviews) ? body.reviews : []

  if (name === '' || description === '') {
    return NextResponse.json({ error: 'A rule name and description are required.' }, { status: 400 })
  }

  if (answers.length === 0) {
    return NextResponse.json({ error: 'There are no votes to record.' }, { status: 400 })
  }

  // A review can change a vote; the later one wins.
  const revisions = new Map()

  for (const review of reviews) {
    const revised = parseVote(review?.answer)

    if (revised) revisions.set(review.id, revised)
  }

  const votes = answers.map((agent) => {
    const original = parseVote(agent?.answer)
    const revised = revisions.get(agent.id) ?? null

    return {
      id: agent.id,
      label: agent.label,
      model: agent.modelUsed ?? null,
      vote: revised?.vote ?? original?.vote ?? 'unparsed',
      confidence: revised?.confidence ?? original?.confidence ?? null,
      reasoning: original?.reasoning ?? [],
      conditions: original?.conditions ?? [],
      // Recorded so a later reader can tell a mind that changed from one that
      // never got counted.
      revised: revised !== null,
    }
  })

  const scored = votes.filter((vote) => typeof vote.confidence === 'number')
  const avgConfidence =
    scored.length > 0
      ? Math.round((scored.reduce((sum, vote) => sum + vote.confidence, 0) / scored.length) * 10) / 10
      : 0

  const tally = {
    approve: votes.filter((vote) => vote.vote === 'approve').length,
    'approve-with-conditions': votes.filter((vote) => vote.vote === 'approve-with-conditions').length,
    disapprove: votes.filter((vote) => vote.vote === 'disapprove').length,
    unparsed: votes.filter((vote) => vote.vote === 'unparsed').length,
  }

  const result = { tally, votes }

  try {
    const id = await saveVotingRound({ name, description, result, avgConfidence })

    return NextResponse.json({ id, avgConfidence, tally, votes }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: describeDbError(error) }, { status: 500 })
  }
}

/*
 * Promotes an already-logged round into the rules in force. Takes the round's id
 * rather than the ballots again, so what is adopted is exactly what was recorded
 * and the two can never disagree.
 */
export async function PUT(request) {
  let body

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 })
  }

  const id = Number(body?.id)

  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'A voting round id is required.' }, { status: 400 })
  }

  try {
    const round = await votingRound(id)

    if (round === null) {
      return NextResponse.json({ error: 'That voting round does not exist.' }, { status: 404 })
    }

    const ruleId = await approveRule({
      name: round.name,
      description: round.description,
      result: round.voting_result,
      avgConfidence: round.avg_confidence_level,
    })

    return NextResponse.json({ ruleId, name: round.name })
  } catch (error) {
    return NextResponse.json({ error: describeDbError(error) }, { status: 500 })
  }
}

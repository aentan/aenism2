---
title: "The rent I didn't pay"
description: "Two small tools I built instead of subscribing — a scheduler and a calendar sync — and what broke along the way."
date: 2026-09-15
topic: work
client: "Self"
tags: ["side projects", "calendars", "ai", "google api"]
draft: true
---

I needed two things. A booking page, so candidates and [ADPList](https://adplist.org) mentees could take time with me without the email ping-pong. And a way to stop co-workers booking me into slots where I was already busy on another calendar.

The market rate for those two things is **$10 a month** for Calendly Standard and **$15 a month** for Reclaim Business — the tiers that actually unlock unlimited event types and unlimited calendar syncs. Three hundred dollars a year, for a form that writes to a calendar and a job that copies busy blocks between calendars.

I don't object to paying for software. I object to renting something I can describe in a sentence. So I built both.

## Scheduler

[`aen-scheduler`](https://github.com/aentan/aen-scheduler) — NestJS, Prisma, Postgres, React, one container on Fly.io. Visitors land on a public page, pick a slot, and the event appears in my Google Calendar with a Meet link and a confirmation email.

{{%figure src="https://media.aenism.com/scheduler-booking.png" title="The public booking page. Only dates with real availability are selectable — everything else has already been reasoned about."%}}

The interesting part isn't the booking form. It's `getAvailableSlots`, which has to compose a single busy set out of things that disagree with each other: free/busy from _every_ connected Google account, existing bookings padded by each slot type's before and after buffers, recurring breaks, holidays, working hours, and any slot another visitor is mid-way through claiming. Candidates come out on a fixed 30-minute grid — not stepped by duration, which would produce ugly 11:47 offers — clamped to minimum notice and maximum lead time.

All of it is timezone-aware, and this is where the bodies are buried. Working hours, breaks and holidays are evaluated in _my_ timezone; slots are returned as UTC. Get that boundary wrong in one direction and you offer meetings at 3am.

Double-booking is prevented twice. The frontend takes a five-minute lock while the visitor fills the form, and then the commit path re-checks everything anyway — database conflicts, per-day caps, live Google free/busy — before it inserts. The lock is a courtesy. The re-check is the guarantee.

{{%figure src="https://media.aenism.com/scheduler-slots.png" title="Slots are meeting types: duration, which calendar to write to, daily cap, buffers, how much notice I need."%}}

One decision I'd defend anywhere: **if Google Calendar fails, the booking is still saved.** It lands with a null event ID and I get an alert email. The alternative is telling someone their interview didn't happen because an API had a bad minute.

## CalSync

[`aen-calsync`](https://github.com/aentan/aen-calsync) — Next.js, Drizzle, Neon Postgres. Connect several Google accounts, then define directional rules — copy busy blocks from A to B, or tick "mirror both ways".

{{%figure src="https://media.aenism.com/calsync-dashboard.png" title="Two accounts, twenty-five calendars, one rule. Calendar names are redacted — they are mostly colleagues' addresses, which is rather the point."%}}

Mirrors are deliberately dumb. By default they carry no title, no description, no reminders, and are marked private and busy. My work calendar learns that I'm unavailable at 2pm without learning why.

Two details do most of the work. Every mirror carries a **private extended-property tag**, so the engine can recognise its own output and refuse to mirror it — without that, a full mesh where a calendar is both source and target multiplies events until something falls over. And every mirror stores a **content hash** of its source, so a re-sync skips anything unchanged and only touches what actually moved.

## What actually broke

None of the hard bugs were features. They were seams.

**Silent OAuth expiry.** Google Calendar quietly stopped syncing. No error, no alert — refresh tokens had rotated and nothing persisted the new ones. The fix is four lines: listen for `oauth2Client.on('tokens', …)` and write them back. Everything that touches the Google API now goes through one client factory, so refresh and persistence can't be forgotten.

**Scale-to-zero ate the cron.** Shrinking both machines to 256 MB and letting them sleep when idle cut hosting to near nothing — and silently broke reminders and token refresh, because an in-process `@Cron` doesn't fire on a stopped machine. Both apps now expose guarded endpoints driven by an external scheduler. The reminder match window is configurable so a less frequent ping can't step over a reminder entirely, and the in-process job stays as an idempotent safety net for when the machine happens to be awake.

Worth saying plainly: **scale-to-zero is a cost decision that quietly changes your execution model.** Nobody tells you that.

**Redirecting to `0.0.0.0`.** Behind Fly's proxy, the Next standalone server reports its own bind host. Post-login redirects sent people to `0.0.0.0`. Build redirect URLs from configuration, never from the incoming request's origin.

**Tailwind v4 custom utilities need `@utility`**, not a plain class rule — otherwise `hover:` and `checked:` prefixes silently generate nothing. That one bit me twice before I wrote it down.

**Google marks flights as "free".** CalSync skips events marked free by default, and Google applies that to flights and most all-day items on its own. The most common "why didn't it sync?" has nothing to do with my code.

## On building these with an agent

Both were built with [Claude Code](https://claude.com/claude-code), and the thing that made it work wasn't prompting. It was maintaining a `CLAUDE.md` in each repo — architecture, conventions, and a gotchas list that grows every time something bites.

The value isn't documentation. It's that an agent will cheerfully reintroduce a bug you fixed last month unless the reason it existed is written down somewhere it reads. "Tailwind v4 custom utilities must use `@utility`" is in that file precisely because the second occurrence taught me the first hadn't stuck.

The other thing worth stealing: the design system moved between projects by being described rather than copied. Two colours, sharp rectangles, one monospace face. CalSync inherited it from Scheduler in an afternoon.

Two apps, both [open](https://github.com/aentan/aen-scheduler) [source](https://github.com/aentan/aen-calsync), both on 256 MB machines that sleep when nobody's looking. Neither is free to run — but neither is three hundred dollars a year, and the version I own doesn't get to change its pricing page.

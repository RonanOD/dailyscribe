---
slug: send-news-to-kindle-scribe
title: How to send the news to your Kindle Scribe automatically
description: Get a newspaper-style digest of the day's headlines delivered to your Kindle Scribe by email — the manual options, their limits, and how to put it on a schedule.
updated: 2026-09-08
order: 1
---

## The Scribe is great for reading, and gives you no way to get the news onto it

The Kindle Scribe shows PDFs cleanly and lets you write in the margins with the pen,
but Amazon builds in no way to pull in a website, an RSS feed, or a daily paper. The
one channel that always works is email: every Kindle has a `@kindle.com` address, and
anything you send there as a supported document — PDF, EPUB, DOCX and a few more —
lands in your library.

So the real question is: how do you get today's headlines into a document and into
that inbox every morning without doing it by hand?

## The manual route

1. Find your device's Send-to-Kindle address under Amazon's **Content & Devices →
   Preferences → Personal Document Settings**.
2. On the same page, add the address you'll send *from* to the **Approved Personal
   Document E-mail List**. Amazon silently drops mail from any address not on it.
3. Save an article as a PDF — or use the *Send to Kindle* browser extension or your
   phone's share sheet — and email it across.

This works, but it is one article at a time, it is a chore, and there is no
scheduling. You are the cron job.

## RSS-to-PDF pipelines

A step up is to wire an RSS reader or an automation tool (an IFTTT applet, a
Make/Zapier scenario, a self-hosted script) to fetch a feed, render it, and email the
result. That is a real improvement, but now you maintain a small pipeline: feed
parsing, a PDF renderer, a mail step, and the approved-sender setup — and most of
these tools output a wall of text rather than something laid out to be read.

## What Daily Scribe does

Daily Scribe is that pipeline, run for you. You choose the sources you want — RTÉ, BBC
and CBC today, by section — and every morning it fetches the day's stories, sets them
like a newspaper page (headline, standfirst, body), and emails a single PDF to your
Scribe at the time you pick. You whitelist one address once and never touch the
plumbing again.

It can also bundle the news with other daily sections — a crossword, a Kanji sheet, a
summary of your smart home — into one **digest** edition, so you get one email instead
of five.

## See also

- [Automatically email a PDF to your Kindle every morning](/guides/email-pdf-to-kindle-every-morning)
- [Kindle Scribe daily delivery: a setup guide](/guides/kindle-scribe-daily-delivery-setup)
- [Frequently asked questions](/faq)

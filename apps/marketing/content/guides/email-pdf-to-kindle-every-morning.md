---
slug: email-pdf-to-kindle-every-morning
title: How to automatically email a PDF to your Kindle every morning
description: Kindle's Send-to-Kindle email works well but can't be scheduled. Here are the ways to send a PDF on a daily timer, and the trade-offs of each.
updated: 2026-09-08
order: 3
---

## Send to Kindle is a delivery mechanism, not a scheduler

Every Kindle — Scribe, Paperwhite, the lot — has a personal `@kindle.com` address.
Email a PDF (or EPUB, DOCX, TXT) to it from an approved sender and it appears in your
library, synced across your devices. It is reliable and it is free.

What it does not do is run on a timer. There is no "send me this every day at 7am" in
Amazon's tools. If you want a document to arrive on a schedule, the scheduling has to
happen somewhere else.

## Options for putting it on a timer

**A cron job and a mail script.** If you are comfortable with a small server or a
cloud function, a scheduled job builds the PDF and sends it through an SMTP or API
mail provider. Total control, but you own the uptime, the rendering, and the
deliverability.

**An automation platform.** Make, Zapier, n8n and similar can run a daily scenario
that grabs a file and emails it. Quicker to set up; you are limited to what the
platform's modules can produce, and richer layouts are hard.

**A purpose-built service.** Something that already knows how to build the document
*and* send it on a schedule, so you only choose the contents and the time.

## Things that bite people

- **The approved-sender list.** Mail from an address that is not on it is dropped
  without a bounce. Add your sender once under **Content & Devices → Preferences →
  Personal Document Settings**.
- **Size limits.** Send-to-Kindle rejects oversized attachments; keep a daily PDF
  lean — compress images, cap article counts.
- **One sender, many messages.** Automating high volume from a single address can run
  into throttling.

## What Daily Scribe does

Daily Scribe is the purpose-built option. You pick sections — news, a crossword, Kanji
practice, a Home Assistant briefing — set a delivery time and time zone, and it
renders and emails one PDF every morning from a single verified address you whitelist
once. Delivery is idempotent, so you get exactly one edition a day, and bounces are
handled automatically.

## See also

- [Send the news to your Kindle Scribe automatically](/guides/send-news-to-kindle-scribe)
- [Kindle Scribe daily delivery: a setup guide](/guides/kindle-scribe-daily-delivery-setup)

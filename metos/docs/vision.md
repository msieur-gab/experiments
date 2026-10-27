# Vision

## The problem

The knowledge that keeps people alive and fed (clean water, which plants are safe, how to grow and store food, how to stay warm) lives mostly online, behind connections, apps and services that fail first in a crisis. Printed manuals survive but are hard to search. AI assistants are searchable but need a data centre, and they make things up, which with plants and water can kill.

## The idea

A small knowledge base you can ask in plain words, that:

- runs on whatever hardware is left: an old laptop, a phone, a cheap board, eventually a machine running Forth
- lives on a USB stick or an SD card, with nothing to install
- answers only with what its entries say, and says when it doesn't know
- anyone can read, correct and extend, by writing a text file

## Principles

**Extractive, never generative.** The answer is the entry's own text. Trust comes from being able to check every word against its source.

**Abstention is a feature.** "I don't have that" is a correct answer. A confident wrong answer about an edible plant is the worst possible failure.

**Authorable by anyone.** Knowledge is plain Markdown. What metos understands is a plain word list (`vocab.txt`). When it misunderstands, you can see why (`why this answer`) and fix it by editing text, not by retraining anything.

**Graceful degradation.** Each target shows the best it can: colour pictures in a browser, half-blocks in a terminal, raw text on anything else. The knowledge stays usable at every level.

**Small enough to understand completely.** The engine is a few hundred lines with whole-number scoring, so one person can read it, port it to C or Forth, and trust it.

**Honest about limits.** Pictures help, but plant identification must never rest on a low-resolution image alone; the written description and warnings carry the safety.

## Who it's for

- First: Gab, testing whether this is possible and useful.
- Then: households, gardens, cabins, go-bags, community spaces, anywhere a small offline reference helps.
- In a real collapse: people with old hardware and no network, the scenario Collapse OS and Dusk OS are built for.

## What it is not

- Not a chatbot. It does not converse or invent.
- Not a replacement for local, expert knowledge, especially for foraging.
- Not tied to any vendor, cloud or app store.

## Related work

- **Collapse OS / Dusk OS** (Virgil Dupras): Forth operating systems for the first stage of collapse. A future metos target.
- **ptiLU / TermNL** (Gab): small, readable intent engines. metos shares the idea that a person should be able to read and extend what the system understands.
- **Brainboard** (Gab): local-first knowledge base with extractive retrieval that abstains. Same stance on answering.
- **Symbiot** (Gab): his portable Orange Pi mini-OS. metos is a sibling device, not its base.

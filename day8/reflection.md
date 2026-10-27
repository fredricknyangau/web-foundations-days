# Reflection

## The hardest concept and how I got past it

The hardest idea for me was concurrency, the fact that two requests can both check that something is free, both pass, and then both write. On paper my code looked correct, and I could not see where the bug would come from. What helped was trying it myself. I opened two database sessions side by side and ran the same update at the same moment. The second one paused, waited for the first to commit, and then found nothing left to update. After that I understood that the database, through transactions, row locks and constraints, should be the one guarding correctness, not my application code. That lesson shaped the whole TicketHub design.

## What I would improve in my capstone

The feedback I got was that my estimates jumped straight to final numbers without showing how I reached them. If I redid the capstone, I would write down every assumption first and show each calculation step by step, so anyone reading can check my reasoning instead of just trusting the result. I tried to do this in the TicketHub estimates.

## What I will learn next

Next I want to go deeper into handling heavy traffic: caching and queues with Redis, and load-testing a real API with a tool like k6 to see where it breaks. The big-sale scenario showed me that a system that works on a normal day can fail completely under a spike. I also want to keep writing design documents for problems close to home, like M-Pesa payment flows, until this framework becomes a habit.

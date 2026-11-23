## Long Cat Out! R9 · 8/10 overall, up from 7

R9 reaches the solid top-100 bar as a build. The best moment is Level 13’s near-full bench turning into a chain. It pays off a decision the player made several moves earlier, and the replay now gives a friend that same board to solve. In a market where six of Q3’s ten highest-grossing hybrid-casual puzzles used flow or conveyor mechanics, the elastic cat is the part worth making unmistakable. [AppMagic Q3 2026 benchmark](https://appmagic.rocks/research/Hybridcasual-Puzzles-Q32026/?hl=en)

| Dimension | R8 → R9 | Assessment |
|---|---:|---|
| Presentation | 8 → **8** | The café, house, and boarding room feel like one game. On short screens, the result cards and hub badges fight for attention. |
| Appeal | 8 → **8** | The curled bench cats, expressive faces, and named residents give the game personality. The extended bodies still look like patterned bolsters in busy boards. |
| Juice | 6 → **7** | The crouch, stretch, landing, and fold give the send a clear rhythm. In the frame strip the cat still reads as one sliding shape through much of the move, and the chain badge can pull focus from the boarding. |
| Fun | 7 → **8** | Exit order and bench capacity create real tradeoffs. The destination preview and last-seat cue make those tradeoffs easier to read, so a chain feels earned. |
| Retention | 7 → **7** | Naming the next resident and giving them an immediate request connects building to the next session. Daily and Cat Show have distinct jobs. Cat Street has depth on paper, but its repeat laps reuse the same shopkeepers. |
| Virality | 5 → **7** | The vertical clip opens with a problem, shows the payoff, and leads to a playable dare. The clip and link still have separate share paths, and delivery through real messaging apps is unverified. |
| Overall | 7 → **8** | The puzzle, café progression, and friend challenge now reinforce each other. The biggest gains left are in making losses teach and making dares travel reliably. |

I reviewed the supplied captures and frame strips, the R9 notes, and the relevant code. `npm run check` passed, including checks across 600 levels. The scores are design judgments from that evidence. Real-phone feel, player retention, and share conversion remain unmeasured in this review. [R8 review](<C:/Users/Admin/Documents/Msjelly/studio/long-cat-out/qa/sol-r8.md>) · [R9 notes](<C:/Users/Admin/Documents/Msjelly/studio/long-cat-out/qa/r9-notes.md>)

## Highest-impact remaining fixes

| Dimension | Build next |
|---|---|
| **Presentation** | At 375×667, give ordinary clears one compact layout with **Next** or **Build** as the dominant action. Let the replay thumbnail expand on tap. On the hub, collapse the locked-floor buttons into one house control and reserve the strongest badge treatment for the current claim or resident request. |
| **Appeal** | Give the long-body sprites a visible shoulder, a soft belly taper, and a paw overlapping the body at the head join. Keep the breed patterns readable at board scale. Add a resident-specific idle at the piece of furniture they unlock so the build visibly changes how they use the room. |
| **Juice** | Make the Level 1 send legible at game speed. Push the crouch silhouette, lead the gap with the front paws, then let the hindquarters and tail catch up. During a chain, put the count beside the bench and tick it on each landing, with one larger accent on the final hop. |
| **Fun** | Turn the Level 49 failure into a playable lesson. Keep the rejected cat, full bench, and matching carrier visible, mark the cat’s attempted route, and have **Take back** restore that exact pre-tap state with the destination preview shown once. Put the bundle behind **More help** so recovery stays the first decision. |
| **Retention** | Complete the first resident loop in the room. Put the newcomer’s request over the cat, include the visible reward in the claim, and show the next return goal after collection. Give the first post-rooftop Cat Street lap a unique shopkeeper or room reward so completion changes what the player sees. |
| **Virality** | Test **Dare a friend** and **Share clip** end to end on iOS and Android through iMessage and WhatsApp where available. When a clip loses its accompanying link, provide a standalone link with a challenge preview. Use **Match my chain ×3** when ×3 is the best achievable result, and validate featured dares on the exact board and seat count the recipient gets. Instrument share handoff, link open, first move, clear, and reshare as one funnel. |
| **Overall** | Run two first-session tests on phones. Start fresh players at Level 1 and track the first chain, Level 4 start, Level 10 reach, and first resident request claim. Start recipients from a real message and track the first move and challenge clear. Use the largest observed drop in each path to choose the next tuning pass. |
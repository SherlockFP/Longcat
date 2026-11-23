**Overall 8/10, up from 7/10.** Long Cat Out! now meets your top-100 benchmark as a design. The paws-first leap gives the game a recognizable move, and watching a full bench empty after one good decision is its best payoff. The biggest remaining gaps are giving players a fresh reason to return and getting a shared clip to turn into a friend’s first move.

| Dimension | Previous | Current | Assessment |
|---|---:|---:|---|
| Presentation | 8 | **8** | The café, street, and puzzle board feel like one world. On short phones, the rails and world labels still crowd each other. |
| Appeal | 8 | **8** | The faces, sleeping bench cats, and resident arrivals sell the fantasy. The straight bodies still read as patterned tubes at rest. |
| Juice | 6 | **8** | The crouch, reaching paws, and fold give the send a clear rhythm. The chain counter now leaves the carrier mouth visible. |
| Fun | 7 | **8** | Choosing which cat can afford to wait gives the puzzle real stakes. The press preview makes those stakes easier to read, and the first four boards teach distinct decisions. |
| Retention | 7 | **7** | The first resident request gives the next win a purpose, and apprentices make the second Cat Street lap worth seeing. Completed floors and later laps still offer weaker reasons to return. |
| Virality | 5 | **7** | The clip tells a clear one-seat-left story. The exact-board dare gives friends an achievable goal, including a match target when the sender has already hit the board maximum. The clip-to-link handoff still adds friction. |
| **Overall** | **7** | **8** | The biggest gain is in the move players repeat every few seconds. |

I scored from the captures and current implementation, including the later changes in [the R9 notes](qa/r9-notes.md). `npm run check` passed. I didn’t play on a physical phone or verify share delivery, and the analytics are local, so retention and virality are design scores without player outcome data.

### Highest-priority fixes

1. **Presentation — fix the 375×667 hub layout.** Collapse completed and locked floors into a single picker in Cat Street. Give building names a lane below the façades and reserve space beside Tasks for the claim badge. The current street capture has names under rail buttons, and the café capture has the build cost tucked behind the currency row.
2. **Appeal — make the resting cat silhouette read at board size.** Start with the orange tabby. Give it shoulders under the head, a softer belly contour, and a tapered rump. Wrap the stripes around those forms, then check straight cats and tight bends at 375 px before applying the treatment to other breeds.
3. **Juice — make the landing move the objects it touches.** Anchor the front paws to the carrier lip for a beat, compress the mat as the body folds, and give the loaded carrier a small settle. Give occupied cushions a quick rebound as each cat springs off. Fit those reactions into the existing timing.
4. **Fun — teach the recovery at the first full-bench loss.** Keep the failed cat, all occupied cushions, and the carrier queue visible above a shorter sheet. Highlight the carrier the cat needs and show how many departures away it is. Lead with **Take back** and **Retry**, and put the Starter Bundle behind **More help**. In a fresh-phone test, check whether players change their next choice after undoing.
5. **Retention — always show what the next win can build.** Replace the large **Floor complete!** card with the next available build and a tap to that room. Give an in-room resident request one home by removing its duplicate goal tile. For Cat Street lap three, give each shop a visible renovation and a shop-specific resident request so the next completion changes something players can see or do.
6. **Virality — make a single message sufficient.** Give **Dare a friend** a rich link preview with the actual chain goal, seat count, and peak frame. Keep the video export available for posting. Verify the link from send to first move on iOS and Android in iMessage and WhatsApp, and collect the existing share-ID events off-device so you can see where recipients drop out.
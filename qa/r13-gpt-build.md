Implemented R13 chapter board themes, fur and carrier cosmetics, and premium purchases through the existing IAP stub. Added the `looks-board` and `looks-shop` QA steps.

Economy checks passed, and the production build includes all six room images. The default build hit a permissions error in the shared `node_modules` directory, so I reran it successfully with `npm run build -- --configLoader native`.

The two browser QA steps remain unverified because headless Chrome failed to launch and browser access was denied. Full QA was skipped. No commit was made.
# Contributing to the Eleven game server #
:+1: First of all, thanks for taking the time to read this! :+1:

The following is a set of guidelines for contributing to the [Eleven game server](https://github.com/ElevenGiants/eleven-server)
code. These rules are not set in stone — use your best judgement, and feel free
to propose changes if you think something should be improved.


## Task distribution, planning, roadmap ##
Work on the game server is managed on [Trello](https://trello.com/b/ZdLBfI1l/game-server).
Tasks waiting to be picked up by somebody are in the **To Do** list, and
generally roughly sorted by priority (decreasing from top to bottom).
Relatively easy tasks that might be a good start point for contributing to the
GS are tagged `low hanging fruit`.
The **TBD** list is also pending, but those topics are waiting on more concrete
specs, further discussion or similar.

When you are starting to work on an item, assign yourself to the respective
card and move it to the **Doing** list. If you are working on something that is
not on Trello yet, please create a card for it. This makes it easy to see for
everyone what is going on, and gives others the opportunity to participate and
provide feedback.


## Development flow ##
Development is following the [​GitHub flow](https://guides.github.com/introduction/flow/index.html)
model, with dev branches being created in each developer's own fork of the main
repo. It's useful to include the Trello card number in the branch name, e.g.
`trello#123_awesome-feature` (you can find the number under the "Share and
more..." link on each card).


## Implementation ##
Please follow our [Javascript style conventions](http://trac.elevengiants.com/trac/wiki/JsCodeStyle),
and generally try to maintain a consistent "feel" with the existing codebase.
This is open source software — consider the people who will read and work with
your code (which includes future you), and make it look nice for them.

Document modules and public functions with [JSDoc](http://usejsdoc.org/)
comments (*public* in a colloquial sense, i.e. anything that is not purely for
module-internal use).

Add unit tests for new functions, and extend/adjust tests where appropriate when
modifying existing functions. For code that involves other GS modules/components
that cannot be easily stubbed, add functional tests. Tests that involve
"external" dependencies (like a database or network resources) should be added
to the integration test suite which is not run automatically by the build
system.

Always write clear log messages for your commits. One-line messages are fine for
small things, bigger changes should look like this:

	$ git commit -m "A brief summary of the commit
	>
	> A paragraph describing what changed and its impact, or a
	> * list
	> * of
	> * changes"

* use the present tense ("add feature", not "added feature")
* use the imperative mood ("fix memory leak", not "fixes memory leak")
* wrap lines at 72 characters
* reference relevant external resources (e.g. Trello cards, bug tickets for
  libraries, Slack archive links etc)

## Pull requests ##
When a feature or bugfix is finished, create a pull request for your branch.
Before submitting it, make sure lint and all tests pass (`npm -s run alltests`),
and if your work touched any core components, check that benchmark results have
not significantly degraded.

Clean up the commit history if necessary (use Git squash and/or rebase). Keep
your commits atomic: no single commit should break existing functionality,
especially not the tests. All of this simplifies future debugging and
maintenance work.

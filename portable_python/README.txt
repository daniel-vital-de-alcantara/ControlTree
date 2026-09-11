ControlTree - Python fallback
=============================

Requirements
------------
Windows with Python 3.10 or newer. No Node.js, npm, Git, administrator
access, pip downloads, or internet connection are needed after this ZIP has
been downloaded.

Starting ControlTree
--------------------
1. Extract the complete ZIP to a folder.
2. Double-click START_CONTROLTREE.bat.
3. Keep the terminal window open while using ControlTree.
4. Close ControlTree by pressing Ctrl+C in the terminal window.

The launcher starts a private web server that listens only on this computer,
then opens ControlTree in the default browser. Dataset processing happens in
the browser and uploaded rows are not sent to GitHub or another server.

When Chrome or Edge grants access through its modern file picker, ControlTree
remembers the last dataset handle on this local address. Opening a matching
saved project can then reconnect that dataset automatically without storing a
second copy of the data inside the ControlTree folder. The browser may ask for
access again if its permissions or site data have been cleared.

Troubleshooting
---------------
If Python is not detected, install 64-bit Python 3.10 or newer and enable the
installer's "Add Python to PATH" option. Corporate users may need their IT team
to provide an approved Python installation.

Project: https://github.com/daniel-vital-de-alcantara/ControlTree

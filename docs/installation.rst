Installation
============

Install the package from a local checkout:

.. code-block:: bash

   pip install .

For local development, install the development extras so Sphinx and pytest are
available:

.. code-block:: bash

   pip install -e .[dev]

To build the documentation locally:

.. code-block:: bash

   sphinx-build -b html docs docs/_build/html

The generated site will be written to ``docs/_build/html``.

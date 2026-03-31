Quickstart
==========

Load example data and start a manual tree session:

.. code-block:: python

   from controltree import load_titanic, start_manual_tree

   df = load_titanic()
   model = start_manual_tree(df).set_target("survived", min_samples_leaf=20)

Inspect candidate split suggestions for the root node:

.. code-block:: python

   splits = model.suggest_splits(top_n=5)
   for split in splits:
       print(split["feature"], split["operator"], split["value"], split["gain"])

Render the current tree state:

.. code-block:: python

   dot = model.show_tree()
   dot

For a higher-level CSV workflow, use ``run_decision_tree_demo``:

.. code-block:: python

   from controltree.workflow import run_decision_tree_demo

   result = run_decision_tree_demo(
       "my_dataset.csv",
       target_col="survived",
       split_index=1,
   )

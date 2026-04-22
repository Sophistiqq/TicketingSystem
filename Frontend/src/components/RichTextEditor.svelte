<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { Editor } from "@tiptap/core";
  import StarterKit from "@tiptap/starter-kit";
  import { Table } from "@tiptap/extension-table";
  import { TableRow } from "@tiptap/extension-table-row";
  import { TableCell } from "@tiptap/extension-table-cell";
  import { TableHeader } from "@tiptap/extension-table-header";

  let {
    value = $bindable(""),
    placeholder = "Write something...",
    disabled = $bindable(false),
  } = $props();

  let element: HTMLDivElement;
  let editor: Editor | null = $state(null);

  onMount(() => {
    editor = new Editor({
      element: element,
      extensions: [
        StarterKit,
        Table.configure({
          resizable: true,
        }),
        TableRow,
        TableHeader,
        TableCell,
      ],
      content: value,
      editable: !disabled,
      onUpdate: ({ editor }) => {
        value = editor.getHTML();
      },
      editorProps: {
        attributes: {
          class: "prose prose-sm max-w-none focus:outline-none min-h-[500px] p-4",
        },
      },
    });
  });

  onDestroy(() => {
    if (editor) {
      editor.destroy();
    }
  });

  $effect(() => {
    if (editor && editor.getHTML() !== value) {
      editor.commands.setContent(value);
    }
  });

  $effect(() => {
    if (editor) {
      editor.setEditable(!disabled);
    }
  });
</script>

<div
  class="border border-base-300 rounded-lg overflow-x-auto bg-base-100 focus-within:border-primary transition-colors"
>
  <div bind:this={element}></div>
</div>

<style>
  /* Enable horizontal scroll for wide tables */
  :global(.prose) {
    max-width: none !important;
  }
  
  :global(.tiptap table) {
    border-collapse: collapse;
    margin: 0;
    overflow: auto; /* Allows table container to scroll */
    width: 100%;
    display: block; /* Essential for overflow on tables */
  }

  :global(.tiptap table td, .tiptap table th) {
    border: 1px solid #ced4da;
    box-sizing: border-box;
    min-width: 1em;
    padding: 3px 5px;
    position: relative;
    vertical-align: top;
  }

  :global(.tiptap table th) {
    background-color: rgba(0, 0, 0, 0.05);
    font-weight: bold;
    text-align: left;
  }

  :global(.tiptap p) {
    margin: 0.5em 0;
  }
</style>

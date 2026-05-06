<script lang="ts">
  import { onMount } from "svelte";
  import Chart, { type ChartConfiguration, type ChartTypeRegistry } from "chart.js/auto";

  let { 
    type, 
    data, 
    options = {}, 
    class: className = "" 
  } = $props<{
    type: keyof ChartTypeRegistry;
    data: any;
    options?: any;
    class?: string;
  }>();

  let canvas = $state<HTMLCanvasElement | null>(null);
  let chart: Chart | null = null;

  $effect(() => {
    // Re-create chart only when type or data changes
    if (canvas && data) {
      if (chart) {
        chart.destroy();
      }

      chart = new Chart(canvas, {
        type,
        data,
        options: {
          responsive: true,
          maintainAspectRatio: false,
          ...options
        }
      });
    }

    return () => {
      if (chart) {
        chart.destroy();
        chart = null;
      }
    };
  });
</script>

<div class="relative w-full h-full {className}">
  <canvas bind:this={canvas}></canvas>
</div>

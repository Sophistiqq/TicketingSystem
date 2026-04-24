<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "../../../lib/api";
  import type { CSATStats } from "../../../lib/types";
  import { Star, TrendingUp, Users, ChartColumn, Clock } from "lucide-svelte";
  import StatsCard from "../../../components/StatsCard.svelte";
  import { openCustomModal } from "../../../stores/ui.svelte";
  import ReportModal from "../../../components/ReportModal.svelte";

  let stats = $state<CSATStats | null>(null);
  let loading = $state(true);
  let selectedMonth = $state(""); // Default to All Time

  onMount(() => loadStats());

  async function loadStats() {
    loading = true;
    const params = new URLSearchParams();
    if (selectedMonth) params.set("month", selectedMonth);

    try {
      const res = await api.get<CSATStats>(`/csat/stats?${params}`);
      if (res) stats = res;
    } catch {
      /* handled */
    }
    loading = false;
  }

  async function showReport(agentId: number) {
    try {
      const params = new URLSearchParams();
      if (selectedMonth) params.set("month", selectedMonth);

      const data = await api.get(`/csat/reports/${agentId}?${params}`);
      if (data) {
        openCustomModal(ReportModal, { data, month: selectedMonth });
      }
    } catch {
      /* handled */
    }
  }

  function ratingColor(n: number): string {
    if (n >= 4) return "bg-success";
    if (n === 3) return "bg-warning";
    return "bg-error";
  }
</script>

<div class="flex flex-col gap-6">
  <div>
    <h1 class="text-3xl font-bold">CSAT Dashboard</h1>
    <p class="text-sm opacity-60 mt-1">
      Advanced Customer Satisfaction Analytics
    </p>
  </div>

  <!-- Filters -->
  <div class="card bg-base-200 p-4">
    <div class="flex flex-wrap items-end gap-3">
      <fieldset class="fieldset">
        <label class="label text-xs" for="csat-month">Select Month</label>
        <input
          id="csat-month"
          type="month"
          class="input input-bordered input-sm"
          bind:value={selectedMonth}
          onchange={loadStats}
        />
      </fieldset>
      <button
        class="btn btn-ghost btn-sm"
        onclick={() => {
          selectedMonth = "";
          loadStats();
        }}>All Time</button
      >
    </div>
  </div>

  {#if loading}
    <div class="flex justify-center py-20">
      <span class="loading loading-spinner loading-lg text-primary"></span>
    </div>
  {:else if stats}
    <!-- Key Metrics -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
      <StatsCard
        icon={Star}
        label="Avg Rating"
        value={stats.average_rating.toFixed(1)}
        sub="out of 5.0"
        color="warning"
      />
      <StatsCard
        icon={Users}
        label="Responses"
        value={stats.total_responses}
        color="info"
      />
      <StatsCard
        icon={Clock}
        label="SLA Met Avg"
        value={stats.sla_impact.met.toFixed(1)}
        sub="vs breached ({stats.sla_impact.breached.toFixed(1)})"
        color="success"
      />
      <StatsCard
        icon={TrendingUp}
        label="Satisfaction"
        value={`${Math.round(((stats.distribution[4] + stats.distribution[5]) / stats.total_responses) * 100)}%`}
        sub="4-5 stars"
        color="success"
      />
    </div>

    <!-- Leaderboard & Distribution -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div class="card bg-base-100 shadow-sm border border-base-300">
        <div class="card-body p-5">
          <h2 class="card-title text-sm mb-4">Agent Performance Leaderboard</h2>
          <div class="flex flex-col gap-2">
            {#each stats.agent_leaderboard as agent}
              <div
                class="flex justify-between items-center p-3 bg-base-200 rounded-xl border border-base-300 shadow-sm"
              >
                <div class="flex flex-col">
                  <div class="flex items-center gap-2">
                    <span class="font-bold text-sm">{agent.name}</span>
                    <span class="text-[10px] opacity-50 font-medium">({agent.count} {agent.count === 1 ? 'response' : 'responses'})</span>
                  </div>
                  <button
                    class="text-[10px] text-primary font-black text-normal uppercase tracking-widest hover:underline w-fit mt-1"
                    onclick={() => showReport(agent.agent_id)}
                  >
                    View Report
                  </button>
                </div>
                <div
                  class="flex items-center gap-1.5 bg-warning/20 text-warning-content px-3 py-1 rounded-lg border border-warning/30"
                >
                  <span class="text-warning font-bold text-sm"
                    >{agent.average.toFixed(1)}</span
                  >
                  <Star size={14} class="text-warning" fill="#fef60b" />
                </div>
              </div>
            {:else}
              <p class="text-xs opacity-50">Not enough data for leaderboard.</p>
            {/each}
          </div>
        </div>
      </div>

      <div class="card bg-base-100 shadow-sm border border-base-300">
        <div class="card-body p-5">
          <h2 class="card-title text-sm mb-4">Rating Distribution</h2>
          <div class="flex flex-col gap-2">
            {#each [5, 4, 3, 2, 1] as r}
              <div class="flex items-center gap-2 text-xs">
                <span class="w-8">{r} ★</span>
                <div class="flex-1 h-3 bg-base-300 rounded overflow-hidden">
                  <div
                    class="{ratingColor(r)} h-full"
                    style="width: {stats.total_responses > 0
                      ? (stats.distribution[r] / stats.total_responses) * 100
                      : 0}%"
                  ></div>
                </div>
                <span class="w-12 text-right">{stats.distribution[r]}</span>
              </div>
            {/each}
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>

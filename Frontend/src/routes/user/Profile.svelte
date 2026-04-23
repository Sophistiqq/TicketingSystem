<script lang="ts">
  import { api } from "../../lib/api";
  import {
    getCurrentUser,
    setCurrentUser,
    displayName,
    userInitials,
  } from "../../stores/user.svelte";
  import { Save, Lock, User as UserIcon, Bell, BellOff } from "lucide-svelte";
  import { requestNotificationPermission } from "../../lib/pwa";

  let user = $derived(getCurrentUser());

  let firstName = $state("");
  let lastName = $state("");
  let email = $state("");
  let username = $state("");
  let password = $state("");
  let confirmPassword = $state("");

  let loading = $state(false);
  let error = $state("");
  let success = $state("");

  let notificationPermission = $state(
    typeof Notification !== "undefined" ? Notification.permission : "default"
  );

  async function toggleNotifications() {
    const granted = await requestNotificationPermission();
    notificationPermission = granted ? "granted" : "denied";
    if (granted) {
      success = "Notifications enabled!";
    } else {
      error = "Notification permission denied.";
    }
  }

  // Initialize form with user data
  $effect(() => {
    if (user) {
      firstName = user.first_name;
      lastName = user.last_name;
      email = user.email;
      username = user.username;
    }
  });

  async function handleUpdate(e: Event) {
    e.preventDefault();
    error = "";
    success = "";

    if (password && password !== confirmPassword) {
      error = "Passwords do not match";
      return;
    }

    loading = true;
    try {
      const body: any = {
        first_name: firstName,
        last_name: lastName,
        email,
        username,
      };
      if (password) body.password = password;

      const updatedUser = await api.patch<any>("/auth/me", body);
      if (updatedUser) {
        setCurrentUser(updatedUser);
        success = "Profile updated successfully!";
        password = "";
        confirmPassword = "";
      }
    } catch (e: any) {
      error = e.message || "Failed to update profile";
    } finally {
      loading = false;
    }
  }
</script>

<div class="max-w-2xl mx-auto flex flex-col gap-6">
  <div>
    <h1 class="text-3xl font-bold">My Profile</h1>
    <p class="text-sm opacity-60 mt-1">
      Manage your account information and password
    </p>
  </div>

  {#if error}
    <div role="alert" class="alert alert-error alert-soft text-sm">{error}</div>
  {/if}
  {#if success}
    <div role="alert" class="alert alert-success alert-soft text-sm">
      {success}
    </div>
  {/if}

  <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
    <!-- Sidebar: Avatar & Info -->
    <div class="md:col-span-1">
      <div class="card bg-base-200 shadow-sm border border-base-300">
        <div class="card-body items-center text-center p-6">
          <div class="avatar avatar-placeholder mb-4">
            <div class="bg-primary text-primary-content w-24 rounded-full">
              <span class="text-3xl font-bold">{userInitials()}</span>
            </div>
          </div>
          <h2 class="font-bold text-lg">{displayName()}</h2>
          <p
            class="text-xs opacity-50 uppercase tracking-widest font-bold mt-1"
          >
            {user?.roles?.join(", ") || "User"}
          </p>
          <div class="badge badge-neutral mt-4 badge-sm">ID: {user?.id}</div>
        </div>
      </div>
    </div>

    <!-- Main Form -->
    <div class="md:col-span-2">
      <form
        onsubmit={handleUpdate}
        class="card bg-base-200 shadow-sm border border-base-300"
      >
        <div class="card-body gap-4 p-6">
          <div class="flex items-center gap-2 mb-2">
            <UserIcon size={16} class="text-primary" />
            <h3 class="font-bold text-sm uppercase tracking-wider opacity-70">
              Personal Information
            </h3>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <fieldset class="fieldset">
              <label
                class="label text-xs font-bold uppercase opacity-50"
                for="p-first">First Name</label
              >
              <input
                id="p-first"
                type="text"
                class="input input-bordered input-sm w-full"
                bind:value={firstName}
                required
              />
            </fieldset>
            <fieldset class="fieldset">
              <label
                class="label text-xs font-bold uppercase opacity-50"
                for="p-last">Last Name</label
              >
              <input
                id="p-last"
                type="text"
                class="input input-bordered input-sm w-full"
                bind:value={lastName}
                required
              />
            </fieldset>
          </div>

          <fieldset class="fieldset">
            <label
              class="label text-xs font-bold uppercase opacity-50"
              for="p-username">Username</label
            >
            <input
              id="p-username"
              type="text"
              class="input input-bordered input-sm w-full"
              bind:value={username}
              required
            />
          </fieldset>

          <fieldset class="fieldset">
            <label
              class="label text-xs font-bold uppercase opacity-50"
              for="p-email">Email Address</label
            >
            <div class="input-group">
              <input
                id="p-email"
                type="email"
                class="input input-bordered input-sm w-full"
                bind:value={email}
                required
              />
            </div>
          </fieldset>

          <div class="divider my-2"></div>

          <div class="flex items-center gap-2 mb-2">
            <Lock size={16} class="text-warning" />
            <h3 class="font-bold text-sm uppercase tracking-wider opacity-70">
              Change Password
            </h3>
          </div>
          <p class="text-[10px] opacity-50 -mt-2 mb-2">
            Leave blank if you don't want to change it
          </p>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <fieldset class="fieldset">
              <label
                class="label text-xs font-bold uppercase opacity-50"
                for="p-pass">New Password</label
              >
              <input
                id="p-pass"
                type="password"
                class="input input-bordered input-sm w-full"
                bind:value={password}
                minlength="8"
              />
            </fieldset>
            <fieldset class="fieldset">
              <label
                class="label text-xs font-bold uppercase opacity-50"
                for="p-confirm">Confirm New Password</label
              >
              <input
                id="p-confirm"
                type="password"
                class="input input-bordered input-sm w-full"
                bind:value={confirmPassword}
              />
            </fieldset>
          </div>

          <div class="card-actions justify-end mt-4">
            <button
              class="btn btn-primary btn-sm px-6 gap-2"
              type="submit"
              disabled={loading}
            >
              {#if loading}<span class="loading loading-spinner loading-xs"
                ></span>{/if}
              <Save size={14} /> Update Profile
            </button>
          </div>
        </div>
      </form>

      <div class="card bg-base-200 shadow-sm border border-base-300 mt-6">
        <div class="card-body p-6">
          <div class="flex items-center gap-2 mb-2">
            <Bell size={16} class="text-secondary" />
            <h3 class="font-bold text-sm uppercase tracking-wider opacity-70">
              Notification Settings
            </h3>
          </div>
          <p class="text-xs opacity-60 mb-4">
            Enable desktop and mobile push notifications to stay updated on your
            tickets even when the app is closed.
          </p>

          <div class="flex items-center justify-between">
            <div class="flex flex-col">
              <span class="text-sm font-bold">Browser Notifications</span>
              <span class="text-[10px] opacity-50"
                >Status: {notificationPermission}</span
              >
            </div>
            {#if notificationPermission === "granted"}
              <div class="badge badge-success badge-soft gap-1">
                <Bell size={10} /> Active
              </div>
            {:else}
              <button
                class="btn btn-secondary btn-sm gap-2"
                onclick={toggleNotifications}
              >
                <Bell size={14} /> Enable Notifications
              </button>
            {/if}
          </div>
        </div>
      </div>
    </div>
  </div>
</div>


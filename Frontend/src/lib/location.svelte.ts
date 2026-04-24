import { route } from "../router.svelte";

export const location = {
    get search() {
        // Accessing route.pathname makes this reactive to navigation
        return route.pathname ? window.location.search : window.location.search;
    }
};
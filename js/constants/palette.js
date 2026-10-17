/* Shared map colors; rendering code consumes the current theme. */
const PALETTE = ["#eee7cf", "#cd846b", "#8baba3", "#dec784", "#d3dfc1"];
const CANVAS_THEMES = {
  light: {
    background: "#e7f2fb",
    land: "#f7fbff",
    outline: "#98b9d5",
    road: "#8196ad",
    curb: "#dce8f3",
    line: "#f3f8ff",
    main: "#4e91d1",
    secondary: "#8db9dc",
    local: "#b8cede",
    trail: "#d6e4ee",
    text: "#183c60",
    label: "#ffffffed",
    grid: "#b7d1e455",
  },
  dark: {
    background: "#060916",
    land: "#0e1428",
    outline: "#6658a3",
    road: "#1e2945",
    curb: "#383d66",
    line: "#819be4",
    main: "#9265e8",
    secondary: "#497fd0",
    local: "#273e67",
    trail: "#18243c",
    text: "#e4f2ff",
    label: "#12182eef",
    grid: "#677ccb22",
  },
};

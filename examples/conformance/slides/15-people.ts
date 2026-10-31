import { defineSlide } from "@live-ish/engine/config";

export default defineSlide({
  id: "people",
  layout: "people",
  title: "Who to ask",
  people: [
    {
      name: "Rosa Quintero",
      role: "Tide gauges"
    },
    {
      name: "Idris Okafor",
      role: "Storm surge models"
    },
    {
      name: "Mai Tran",
      role: "Harbor engineering"
    },
    {
      name: "Aleks Novak",
      role: "Datum surveys"
    },
    {
      name: "Priya Raman",
      role: "Sea level records"
    },
    {
      name: "Tom Fairweather",
      role: "Pilotage"
    },
    {
      name: "Noor Haddad",
      role: "Dredging"
    },
    {
      name: "Lena Sørensen",
      role: "Wave climate"
    },
    {
      name: "Jo Whitlock",
      role: "Port operations"
    }
  ],
  notes: "Names and roles, initials otherwise."
});

import bs58 from "bs58";

// Klistra in din base58-nyckel här:
const base58Key = "32gYr2KXe7TowecGxT4ndu5RBSBewFUk3BZGCHXoWZahRi8xfYSdEqVkQB3GwddYBj9DbLMTyQc2NPovjvMMXBqE";

const decoded = bs58.decode(base58Key);
console.log(JSON.stringify(Array.from(decoded)));

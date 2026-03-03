import { prisma } from "./src/lib/prisma";

async function main() {
  const keys = Object.keys(prisma).filter((k) => !k.startsWith("$"));
  console.log(keys);
  await prisma.$disconnect();
}

main();
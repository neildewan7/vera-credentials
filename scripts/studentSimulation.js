const hre = require("hardhat");

const STATUS = ["Unknown", "Active", "Revoked"];
const DEGREE_REGISTRY = "0x72eEe3cefD78aAeeD9a833464839323C2CF51BA8"; // HDSI's existing registry
const SELF_REPORTED = "0x506cCA5F20F48a0E47e3AEe29067B93A72A36405";
const CREDENTIAL_REGISTRY = "0xD3333358dE40D64F4d4dfCa035a593de42C73CAc"; // fixed version

async function main() {
  const [hdsi, student] = await hre.ethers.getSigners();
  console.log("HDSI (issuer):   ", hdsi.address);
  console.log("Student (holder):", student.address);

  const degreeRegistry = await hre.ethers.getContractAt("DocumentRegistryTemplate", DEGREE_REGISTRY);
  const selfReported = await hre.ethers.getContractAt("SelfReportedRegistry", SELF_REPORTED);
  const credentialRegistry = await hre.ethers.getContractAt("CredentialRegistry", CREDENTIAL_REGISTRY);
  const txHashes = [];
  const salt = Date.now().toString();

  console.log("\n=== HDSI registers the student's degree ===");
  const degreeId = hre.ethers.id(`sim2-degree-${salt}`);
  let tx = await degreeRegistry.connect(hdsi).registerDocument(degreeId, degreeId, "ipfs://degree", student.address);
  let receipt = await tx.wait();
  txHashes.push({ step: "Register degree", hash: receipt.hash });
  console.log("  tx:", receipt.hash);

  console.log("\n=== HDSI registers two grades ===");
  const grades = [
    { course: "DSC 180A", id: hre.ethers.id(`sim2-grade-dsc180a-${salt}`) },
    { course: "DSC 102", id: hre.ethers.id(`sim2-grade-dsc102-${salt}`) },
  ];
  for (const grade of grades) {
    tx = await degreeRegistry.connect(hdsi).registerDocument(grade.id, grade.id, `ipfs://grade-${grade.course}`, student.address);
    receipt = await tx.wait();
    txHashes.push({ step: `Register grade (${grade.course})`, hash: receipt.hash });
    console.log(`  ${grade.course} tx:`, receipt.hash);
  }

  console.log("\n=== HDSI issues an institutional credential — same mechanism, verified tier ===");
  const hdsiCredId = hre.ethers.id(`sim2-hdsi-cred-${salt}`);
  tx = await degreeRegistry.connect(hdsi).registerDocument(hdsiCredId, hdsiCredId, "ipfs://hdsi-teaching-fellowship", student.address);
  receipt = await tx.wait();
  txHashes.push({ step: "Register HDSI credential (Teaching Fellowship)", hash: receipt.hash });
  console.log("  tx:", receipt.hash);

  console.log("\n=== Student self-reports an external credential — no issuer, self-reported tier ===");
  const awsCertId = hre.ethers.id(`sim2-aws-cert-${salt}`);
  tx = await selfReported.connect(student).register(awsCertId, awsCertId, "ipfs://aws-cloud-practitioner");
  receipt = await tx.wait();
  txHashes.push({ step: "Self-report credential (AWS Cloud Practitioner)", hash: receipt.hash });
  console.log("  tx:", receipt.hash);

  console.log("\n=== Student links their self-reported credential to their own degree ===");
  tx = await credentialRegistry.connect(student).linkCredential(awsCertId, DEGREE_REGISTRY, degreeId);
  receipt = await tx.wait();
  txHashes.push({ step: "Link self-reported credential to degree", hash: receipt.hash });
  console.log("  tx:", receipt.hash);

  console.log("\n=== The STUDENT's own wallet checks everything ===");
  const results = {};
  results.degree = STATUS[await degreeRegistry.connect(student).verify(degreeId, degreeId)];
  console.log(`  Degree -> ${results.degree}`);
  for (const grade of grades) {
    const s = STATUS[await degreeRegistry.connect(student).verify(grade.id, grade.id)];
    results[grade.course] = s;
    console.log(`  ${grade.course} grade -> ${s}`);
  }
  results.hdsiCredential = STATUS[await degreeRegistry.connect(student).verify(hdsiCredId, hdsiCredId)];
  console.log(`  HDSI credential (Teaching Fellowship) -> ${results.hdsiCredential} [verified tier — issued by HDSI]`);
  results.awsCredential = STATUS[await selfReported.connect(student).verify(awsCertId, awsCertId)];
  console.log(`  Self-reported credential (AWS Cloud Practitioner) -> ${results.awsCredential} [self-reported tier — not confirmed by any issuer]`);

  const [parentRegistry, parentDocId] = await credentialRegistry.getLink(awsCertId);
  console.log(`\n  Link confirmed: AWS cert -> degree ${parentDocId} in registry ${parentRegistry}`);

  console.log("\n=== Transactions (independently verifiable) ===");
  for (const { step, hash } of txHashes) {
    console.log(`  ${step}: https://amoy.polygonscan.com/tx/${hash}`);
  }

  return { hdsi: hdsi.address, student: student.address, degreeId, grades, hdsiCredId, awsCertId, results, txHashes };
}

main()
  .then((result) => {
    require("fs").writeFileSync(
      require("path").join(__dirname, "../indexer/simulation-result.json"),
      JSON.stringify(result, null, 2)
    );
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

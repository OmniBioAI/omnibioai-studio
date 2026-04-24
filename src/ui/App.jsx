import React, { useState } from "react";

import Wizard from "./pages/Wizard";
import Mode from "./pages/Mode";
import LLM from "./pages/LLM";
import Cloud from "./pages/Cloud";
import HPC from "./pages/HPC";
import Launch from "./pages/Launch";

export default function App() {

  const [step, setStep] = useState(0);

  const [config, setConfig] = useState({
    mode: "local",
    llm: {},
    cloud: {},
    hpc: {}
  });

  const stepNames = [
    "Mode",
    "LLM",
    "Cloud",
    "HPC",
    "Launch"
  ];

  const stepComponents = [
    <Mode config={config} setConfig={setConfig} />,
    <LLM config={config} setConfig={setConfig} />,
    <Cloud config={config} setConfig={setConfig} />,
    <HPC config={config} setConfig={setConfig} />,
    <Launch config={config} />
  ];

  return (
    <Wizard
      step={step}
      steps={stepNames}
      setStep={setStep}
    >
      {stepComponents[step]}
    </Wizard>
  );
}
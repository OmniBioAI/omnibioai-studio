import React from "react";

export default function Wizard({
  step,
  steps,
  setStep,
  children
}) {

  const isFirst = step === 0;
  const isLast = step === steps.length - 1;

  return (
    <div
      style={{
        padding: "30px",
        fontFamily: "Arial, sans-serif",
        maxWidth: "1000px",
        margin: "0 auto"
      }}
    >

      {/* Header */}

      <div style={{ marginBottom: "30px" }}>
        <h1>OmniBioAI Studio</h1>

        <p>
          AI-native bioinformatics orchestration platform
        </p>
      </div>

      {/* Progress */}

      <div style={{ marginBottom: "30px" }}>
        <div
          style={{
            display: "flex",
            gap: "10px",
            marginBottom: "10px"
          }}
        >
          {steps.map((s, index) => (
            <div
              key={index}
              style={{
                flex: 1,
                padding: "10px",
                textAlign: "center",
                borderRadius: "8px",
                background:
                  index === step
                    ? "#2563eb"
                    : index < step
                    ? "#16a34a"
                    : "#d1d5db",
                color:
                  index <= step
                    ? "white"
                    : "black",
                fontWeight: "bold"
              }}
            >
              {s}
            </div>
          ))}
        </div>

        <div>
          Step {step + 1} of {steps.length}
        </div>
      </div>

      {/* Main Content */}

      <div
        style={{
          minHeight: "500px",
          border: "1px solid #d1d5db",
          borderRadius: "12px",
          padding: "20px",
          background: "#f9fafb"
        }}
      >
        {children}
      </div>

      {/* Footer Controls */}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: "30px"
        }}
      >

        <button
          disabled={isFirst}
          onClick={() => setStep(step - 1)}
          style={{
            padding: "10px 20px",
            borderRadius: "8px",
            border: "none",
            cursor: isFirst ? "not-allowed" : "pointer",
            opacity: isFirst ? 0.5 : 1
          }}
        >
          Back
        </button>

        <button
          disabled={isLast}
          onClick={() => setStep(step + 1)}
          style={{
            padding: "10px 20px",
            borderRadius: "8px",
            border: "none",
            background: "#2563eb",
            color: "white",
            cursor: isLast ? "not-allowed" : "pointer",
            opacity: isLast ? 0.5 : 1
          }}
        >
          Next
        </button>

      </div>

    </div>
  );
}
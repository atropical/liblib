import React from "react";
import { Flex, Link, Text } from "figma-kit";

export const Footer: React.FC = () => (
  <Flex gap="2" justify="between" align="end">
    <Text style={{ color: "var(--figma-color-text-secondary)" }}>
      This is an open source plugin.{" "}
      <Link target="_blank" href="https://github.com/atropical/liblib">
        Contribute ↗
      </Link>
    </Text>
    <Text style={{ color: "var(--figma-color-text-secondary)" }}>
      AI vibed + human polished from Norway by{" "}
      <Link target="_blank" href="https://atropical.no?utm_source=figma-plugin">
        Atropical
      </Link>
      .
    </Text>
  </Flex>
);

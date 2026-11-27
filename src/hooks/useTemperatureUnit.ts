import { useCallback, useEffect, useState } from "react";
import {
  TemperatureUnit,
  getTemperatureUnit,
  setTemperatureUnit,
  subscribeTemperatureUnit,
} from "../utils/temperatureUnit";

export function useTemperatureUnit(): [
  TemperatureUnit,
  (unit: TemperatureUnit) => void
] {
  const [unit, setUnitState] = useState<TemperatureUnit>(() =>
    getTemperatureUnit()
  );

  useEffect(() => {
    setUnitState(getTemperatureUnit());
    return subscribeTemperatureUnit((nextUnit) => {
      setUnitState(nextUnit);
    });
  }, []);

  const updateUnit = useCallback((nextUnit: TemperatureUnit) => {
    setTemperatureUnit(nextUnit);
    setUnitState(nextUnit);
  }, []);

  return [unit, updateUnit];
}

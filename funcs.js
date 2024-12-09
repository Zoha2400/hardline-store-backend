const brightColors = [
  "#FF5733", // Красный
  "#33FF57", // Зеленый
  "#3357FF", // Синий
  "#FF33A1", // Розовый
  "#F1C40F", // Желтый
  "#8E44AD", // Фиолетовый
  "#3498DB", // Голубой
  "#2ECC71", // Светло-зеленый
  "#E74C3C", // Оранжевый
  "#27AE60", // Тёмно-зеленый
  "#9B59B6", // Лаванда
  "#1ABC9C", // Турquoise
  "#D35400", // Коричневый
  "#34495E", // Темно-синий
  "#F39C12", // Оранжевый (темный)
  "#16A085", // Тюркоазовый
  "#E67E22", // Апельсиновый
  "#2980B9", // Синий
  "#D3D3D3", // Светло-серый
  "#7F8C8D", // Серый
];

export default function getRandomBrightColor() {
  const randomIndex = Math.floor(Math.random() * brightColors.length);
  return brightColors[randomIndex];
}

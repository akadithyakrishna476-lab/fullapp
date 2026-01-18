import { useRoute } from '@react-navigation/native';
import SpreadsheetScreen from '../screens/SpreadsheetScreen';

export default function SpreadsheetRoute() {
  const route = useRoute();
  return <SpreadsheetScreen route={route} />;
}

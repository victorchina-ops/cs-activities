using System;

class Program
{
    static bool IsCoolHour(int hour)
    {
        return (hour >= 6 && hour <= 9) || (hour >= 18 && hour <= 21);
    }

    static void Main()
    {
        int moisture = int.Parse(Console.ReadLine());
        int temp = int.Parse(Console.ReadLine());
        int hour = int.Parse(Console.ReadLine());
        if (moisture < 0 || moisture > 100)
        {
            Console.WriteLine("חיישן תקול");
        }
        else if (moisture < 30)
        {
            if (IsCoolHour(hour))
            {
                if (temp > 35) Console.WriteLine("השקיה ארוכה: 20 דקות");
                else Console.WriteLine("השקיה רגילה: 10 דקות");
            }
            else Console.WriteLine("יבש מאוד - להשקות בשעה קרירה");
        }
        else if (moisture < 60 && temp > 35) Console.WriteLine("השקיה קצרה: 5 דקות");
        else Console.WriteLine("אין צורך בהשקיה");
    }
}

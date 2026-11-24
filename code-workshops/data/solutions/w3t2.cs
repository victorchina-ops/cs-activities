using System;

class Program
{
    static bool IsValidHour(int h)
    {
        return h >= 0 && h <= 23;
    }

    static bool IsValidMinute(int m)
    {
        return m >= 0 && m <= 59;
    }

    static void Main()
    {
        int hour = int.Parse(Console.ReadLine());
        int minute = int.Parse(Console.ReadLine());
        if (!IsValidHour(hour))
        {
            Console.WriteLine("שעה לא תקינה");
        }
        else if (!IsValidMinute(minute))
        {
            Console.WriteLine("דקות לא תקינות");
        }
        else if (hour >= 5 && hour <= 11)
        {
            Console.WriteLine("בוקר טוב");
        }
        else if (hour >= 12 && hour <= 16)
        {
            Console.WriteLine("צהריים טובים");
        }
        else if (hour >= 17 && hour <= 21)
        {
            Console.WriteLine("ערב טוב");
        }
        else
        {
            Console.WriteLine("לילה טוב");
        }
    }
}
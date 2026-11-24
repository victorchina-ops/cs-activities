using System;

class Program
{
    static int GetHours(int sec)
    {
        return sec / 3600;
    }

    static int GetMinutes(int sec)
    {
        return sec % 3600 / 60;
    }

    static int GetSeconds(int sec)
    {
        return sec % 60;
    }

    static void Main()
    {
        int total = int.Parse(Console.ReadLine());
        Console.WriteLine("שעות: " + GetHours(total));
        Console.WriteLine("דקות: " + GetMinutes(total));
        Console.WriteLine("שניות: " + GetSeconds(total));
    }
}